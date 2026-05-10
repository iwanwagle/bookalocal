// Token service.
//
// Implements the access + refresh token pattern with automatic rotation and
// family revocation on suspected theft.
//
//   Access token:  short-lived (15 min default). JWT. Sent in Authorization header.
//   Refresh token: long-lived (30 days). Opaque random string, hashed in DB.
//
// On refresh:
//   1. Client POSTs the refresh token to /auth/refresh.
//   2. We look up the hash. If it doesn't exist or is expired/revoked, reject.
//   3. If it has already been consumed, treat as theft: revoke the whole family
//      and force the user to log in again. (This catches the case where an
//      attacker stole a token and used it once before the legitimate user.)
//   4. Otherwise: mark consumed, issue a new pair, link them via family_id.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

const sha256 = (input) =>
  crypto.createHash('sha256').update(input).digest('hex');

// 64 hex chars = 256 bits of entropy
const generateRefreshToken = () => crypto.randomBytes(32).toString('hex');

const generateAccessToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

/**
 * Issue a brand-new pair (used at login / register / OAuth exchange).
 * @param {object} user — must have .id and .role
 * @param {object} req — Express req (used to capture ip + user-agent for audit)
 * @returns {{ accessToken, refreshToken, refreshExpiresAt }}
 */
async function issueTokenPair(user, req) {
  const refreshToken = generateRefreshToken();
  const tokenHash = sha256(refreshToken);
  const familyId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      user.id,
      tokenHash,
      familyId,
      expiresAt,
      req?.ip?.slice(0, 64) || null,
      req?.get?.('User-Agent')?.slice(0, 255) || null,
    ]
  );

  return {
    accessToken: generateAccessToken(user.id, user.role),
    refreshToken,
    refreshExpiresAt: expiresAt.toISOString(),
  };
}

/**
 * Rotate an existing refresh token. Returns a new pair, or throws on theft/expiry.
 */
async function rotateRefreshToken(rawToken, req) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length !== 64) {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
  }
  const tokenHash = sha256(rawToken);

  // Lock the row to prevent concurrent refresh attempts from both succeeding
  // (one would mark consumed_at, the other should see consumed and trigger theft).
  // Postgres SELECT ... FOR UPDATE serializes them.
  const lookup = await query(
    `SELECT id, user_id, family_id, consumed_at, revoked_at, expires_at
       FROM refresh_tokens
      WHERE token_hash = $1
      FOR UPDATE`,
    [tokenHash]
  );

  if (!lookup.rows.length) {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
  }

  const row = lookup.rows[0];

  if (row.revoked_at) {
    throw Object.assign(new Error('Refresh token revoked'), { status: 401 });
  }

  if (row.expires_at < new Date()) {
    throw Object.assign(new Error('Refresh token expired'), { status: 401 });
  }

  if (row.consumed_at) {
    // SUSPECTED THEFT: this token was already used. Revoke the entire family
    // — the legitimate refresh chain is poisoned. The user must log in again.
    await query(
      `UPDATE refresh_tokens
          SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE family_id = $1`,
      [row.family_id]
    );
    throw Object.assign(
      new Error('Refresh token reuse detected — please log in again'),
      { status: 401 }
    );
  }

  // Look up the user (we need role for the new access token)
  const userResult = await query(
    'SELECT id, role, is_active FROM users WHERE id = $1',
    [row.user_id]
  );
  if (!userResult.rows.length || !userResult.rows[0].is_active) {
    throw Object.assign(new Error('User not found or disabled'), { status: 401 });
  }
  const user = userResult.rows[0];

  // Mint the new pair
  const newRawToken = generateRefreshToken();
  const newHash = sha256(newRawToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);

  // Insert the new token, linked to the same family
  const insertResult = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      user.id,
      newHash,
      row.family_id,
      newExpiresAt,
      req?.ip?.slice(0, 64) || null,
      req?.get?.('User-Agent')?.slice(0, 255) || null,
    ]
  );

  // Mark the old token consumed and link to the new one
  await query(
    `UPDATE refresh_tokens
        SET consumed_at = NOW(),
            replaced_by = $1
      WHERE id = $2`,
    [insertResult.rows[0].id, row.id]
  );

  return {
    accessToken: generateAccessToken(user.id, user.role),
    refreshToken: newRawToken,
    refreshExpiresAt: newExpiresAt.toISOString(),
  };
}

/**
 * Revoke a single refresh token (logout) or all of a user's tokens (logout-all).
 */
async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  await query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL`,
    [sha256(rawToken)]
  );
}

async function revokeAllUserTokens(userId) {
  await query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL`,
    [userId]
  );
}

module.exports = {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  generateAccessToken,
};

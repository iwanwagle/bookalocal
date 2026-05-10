const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const email = require('../utils/emailQueue');
const tokens = require('../utils/tokens');
const { setAuthCookies, clearAuthCookies } = require('../utils/cookies');

const sha256 = (input) => crypto.createHash('sha256').update(input).digest('hex');

// Detect "is this a browser request" so we know whether to bother including
// raw tokens in the JSON body. Browsers will rely on cookies; mobile/SDK
// clients send X-Client-Type: native and get the tokens in the body.
const isNativeClient = (req) => req.get('x-client-type') === 'native';

// Build the auth response, setting cookies and (for native clients only)
// also returning raw tokens in the JSON body.
const respondWithTokens = (req, res, status, { accessToken, refreshToken, refreshExpiresAt, user }) => {
  setAuthCookies(res, { accessToken, refreshToken });
  const body = { user };
  if (isNativeClient(req)) {
    body.token = accessToken;
    body.refresh_token = refreshToken;
    body.refresh_expires_at = refreshExpiresAt;
  }
  return res.status(status).json(body);
};

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Za-z])(?=.*\d)/),
  body('first_name').trim().isLength({ min: 1, max: 100 }),
  body('last_name').trim().isLength({ min: 1, max: 100 }),
  body('role').optional().isIn(['traveler', 'guide']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email: emailAddress, password, first_name, last_name, phone, role = 'traveler' } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [emailAddress]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 12);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(first_name + ' ' + last_name)}&background=random&color=fff`;

    const rawVerifyToken = uuidv4();
    const verifyTokenHash = sha256(rawVerifyToken);
    const verifyExpires = new Date(Date.now() + 24 * 3600 * 1000);

    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, avatar_url,
                          is_verified, email_verify_token, email_verify_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, email, first_name, last_name, role, avatar_url, is_verified`,
      [emailAddress, password_hash, first_name, last_name, phone, role, avatarUrl,
       false, verifyTokenHash, verifyExpires]
    );

    const user = result.rows[0];

    if (role === 'guide') {
      await query('INSERT INTO guide_profiles (user_id, country) VALUES ($1, $2)', [user.id, 'Nepal']);
    }

    email.sendWelcome({ to: user.email, firstName: first_name, role }).catch(() => {});
    email.sendEmailVerification({ to: user.email, firstName: first_name, verifyToken: rawVerifyToken }).catch(() => {});

    const pair = await tokens.issueTokenPair(user, req);
    return respondWithTokens(req, res, 201, { ...pair, user });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email: emailAddress, password } = req.body;

    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [emailAddress]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const pair = await tokens.issueTokenPair(user, req);
    const { password_hash, reset_token, email_verify_token, ...safeUser } = user;
    return respondWithTokens(req, res, 200, { ...pair, user: safeUser });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.role, u.is_verified, u.created_at,
              gp.id as guide_profile_id, gp.profile_status, gp.bio, gp.location, gp.avg_rating, gp.total_reviews
       FROM users u
       LEFT JOIN guide_profiles gp ON gp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const { email: emailAddress } = req.body;

    const result = await query(
      'SELECT id, first_name FROM users WHERE email = $1 AND is_active = true',
      [emailAddress]
    );

    if (result.rows.length) {
      const token = uuidv4();
      const tokenHash = sha256(token);
      const expires = new Date(Date.now() + 3600000); // 1 hour
      await query(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [tokenHash, expires, result.rows[0].id]
      );
      email.sendPasswordReset({
        to: emailAddress,
        firstName: result.rows[0].first_name,
        resetToken: token,
      }).catch(() => {});
    }
    // Same response regardless of whether email exists (prevents enumeration).
    res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty().isLength({ min: 10, max: 100 }),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters and include a letter and a number'),
], async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const tokenHash = sha256(token);
    const result = await query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [tokenHash]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const hash = await bcrypt.hash(password, 12);
    await query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hash, result.rows[0].id]
    );

    // Revoke every refresh-token session for this user after a password reset.
    try {
      await tokens.revokeAllUserTokens(result.rows[0].id);
    } catch (e) {
      console.error('Failed to revoke sessions after password reset:', e.message);
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /auth/verify-email
router.post('/verify-email', [body('token').isLength({ min: 32, max: 64 })], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid token format' });

    const { token } = req.body;
    const tokenHash = sha256(token);
    const result = await query(
      `UPDATE users
          SET is_verified = true,
              email_verify_token = NULL,
              email_verify_expires = NULL,
              updated_at = NOW()
        WHERE email_verify_token = $1
          AND email_verify_expires > NOW()
          AND is_verified = false
        RETURNING id, email, first_name, last_name, role, avatar_url, is_verified`,
      [tokenHash]
    );

    if (!result.rows.length) {
      return res.status(400).json({ error: 'Verification link is invalid or has expired' });
    }

    const { invalidateUserCache } = require('../middleware/auth');
    await invalidateUserCache(result.rows[0].id);

    res.json({ user: result.rows[0], message: 'Email verified!' });
  } catch (err) { next(err); }
});

// POST /auth/resend-verification
router.post('/resend-verification', authenticate, async (req, res, next) => {
  try {
    const userResult = await query('SELECT id, email, first_name, is_verified FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    if (user.is_verified) return res.status(400).json({ error: 'Email already verified' });

    const rawVerifyToken = uuidv4();
    const verifyTokenHash = sha256(rawVerifyToken);
    const verifyExpires = new Date(Date.now() + 24 * 3600 * 1000);
    await query(
      'UPDATE users SET email_verify_token = $1, email_verify_expires = $2 WHERE id = $3',
      [verifyTokenHash, verifyExpires, user.id]
    );

    email.sendEmailVerification({ to: user.email, firstName: user.first_name, verifyToken: rawVerifyToken }).catch(() => {});
    res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (err) { next(err); }
});

// POST /auth/refresh — exchange a refresh token for a new access+refresh pair.
//
// Sources for the refresh token (in priority order):
//   1. The bl_refresh httpOnly cookie (browser default)
//   2. The JSON body (native clients that opted out of cookies)
router.post('/refresh',
  validate([
    body('refresh_token').optional().isString().isLength({ min: 32, max: 128 }),
  ]),
  async (req, res) => {
    try {
      const rawToken = req.cookies?.bl_refresh || req.body?.refresh_token;
      if (!rawToken) {
        return res.status(401).json({ error: 'No refresh token provided' });
      }
      const result = await tokens.rotateRefreshToken(rawToken, req);

      // Set fresh cookies. For native clients, also include in body.
      setAuthCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
      const body = { ok: true };
      if (isNativeClient(req)) {
        body.token = result.accessToken;
        body.refresh_token = result.refreshToken;
        body.refresh_expires_at = result.refreshExpiresAt;
      }
      res.json(body);
    } catch (err) {
      // Clear cookies on any refresh failure — the user must re-authenticate.
      clearAuthCookies(res);
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// POST /auth/logout — revoke this device's refresh token and clear cookies.
router.post('/logout',
  validate([
    body('refresh_token').optional().isString().isLength({ min: 32, max: 128 }),
  ]),
  async (req, res) => {
    try {
      const rawToken = req.cookies?.bl_refresh || req.body?.refresh_token;
      if (rawToken) await tokens.revokeRefreshToken(rawToken);
    } catch {
      // Never leak failure details.
    }
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  }
);

// POST /auth/logout-all
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await tokens.revokeAllUserTokens(req.user.id);
    clearAuthCookies(res);
    res.json({ message: 'All sessions revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Could not revoke sessions' });
  }
});

module.exports = router;

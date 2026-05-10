const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const { validate } = require('../middleware/validate');
const { body } = require('express-validator');
const email = require('../utils/emailQueue');

const generateToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '7d' });

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Only register strategy if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.API_URL || 'http://localhost:5000'}/api/auth/google/callback`,
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email_addr = profile.emails?.[0]?.value;
        const first_name = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
        const last_name = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
        const avatar_url = profile.photos?.[0]?.value;

        // Look up by google_id first (definitive match) then by email.
        // SECURITY: do NOT auto-link a Google login to an existing password-account just because
        // the email matches. That would let anyone who controls a Gmail address take over a
        // password-protected account that happens to use the same email. We only auto-link if
        // the existing account has no password yet (e.g. they signed up via Google in the past).
        let userByGoogleId = await query('SELECT * FROM users WHERE google_id = $1', [googleId]);
        if (userByGoogleId.rows.length) {
          const user = userByGoogleId.rows[0];
          await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
          return done(null, user);
        }

        const userByEmail = await query('SELECT * FROM users WHERE email = $1', [email_addr]);
        if (userByEmail.rows.length) {
          const existing = userByEmail.rows[0];
          if (existing.password_hash) {
            // Account exists with password auth. Refuse the OAuth login to avoid takeover.
            // The user must sign in with their password and link Google from settings (not implemented here).
            return done(new Error('AccountExistsWithPassword'), null);
          }
          // No password set — safe to link Google id to this account
          await query(
            'UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), last_login = NOW() WHERE id = $3',
            [googleId, avatar_url, existing.id]
          );
          return done(null, { ...existing, google_id: googleId });
        }

        // New user — create account (default role: traveler)
        const newUser = await query(
          `INSERT INTO users (email, first_name, last_name, google_id, avatar_url, role, is_verified, is_active)
           VALUES ($1, $2, $3, $4, $5, 'traveler', true, true) RETURNING *`,
          [email_addr, first_name, last_name, googleId, avatar_url]
        );

        const user = newUser.rows[0];
        // Send welcome email
        email.sendWelcome({ to: user.email, firstName: first_name, role: 'traveler' }).catch(() => {});
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  ));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const result = await query('SELECT * FROM users WHERE id = $1', [id]);
      done(null, result.rows[0] || null);
    } catch (err) { done(err, null); }
  });
}

// GET /api/auth/google
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).json({ error: 'Google OAuth not configured' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

// GET /api/auth/google/callback
router.get('/google/callback',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.redirect(`${CLIENT_URL}/login?error=oauth_not_configured`);
    }
    passport.authenticate('google', { session: false }, (err, user) => {
      if (err && err.message === 'AccountExistsWithPassword') {
        return res.redirect(`${CLIENT_URL}/login?error=account_exists_password`);
      }
      if (err || !user) {
        return res.redirect(`${CLIENT_URL}/login?error=oauth_failed`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  async (req, res) => {
    try {
      const user = req.user;
      // Issue a one-time code (cryptographically random) and store the user/role
      // server-side. The frontend exchanges the code for a JWT via POST /auth/oauth/exchange.
      // This keeps the JWT out of URLs, server logs, and Referer headers.
      const code = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 1000); // 60-second TTL

      await query(
        'INSERT INTO oauth_codes (code, user_id, role, expires_at) VALUES ($1, $2, $3, $4)',
        [code, user.id, user.role, expiresAt]
      );

      res.redirect(`${CLIENT_URL}/login?oauth_code=${code}`);
    } catch (err) {
      console.error('OAuth callback error:', err.message);
      res.redirect(`${CLIENT_URL}/login?error=oauth_error`);
    }
  }
);

// POST /api/auth/oauth/exchange — swap a one-time code for a JWT
router.post('/oauth/exchange',
  validate([
    body('code').isString().isLength({ min: 64, max: 64 })
      .withMessage('code must be a 64-character hex string'),
  ]),
  async (req, res) => {
  try {
    const { code } = req.body;

    // Atomically claim the code: only succeeds if it exists, hasn't been used, and isn't expired
    const result = await query(
      `UPDATE oauth_codes
          SET consumed_at = NOW()
        WHERE code = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING user_id, role`,
      [code]
    );

    if (!result.rows.length) {
      return res.status(400).json({ error: 'Code is invalid, expired, or already used' });
    }

    const { user_id, role } = result.rows[0];

    // Issue a short-lived access token + long-lived refresh token (rotation enabled)
    const tokens = require('../utils/tokens');
    const pair = await tokens.issueTokenPair({ id: user_id, role }, req);

    // Best-effort cleanup of expired/used codes. Doesn't block the response.
    query(`DELETE FROM oauth_codes WHERE expires_at < NOW() OR consumed_at < NOW() - INTERVAL '1 hour'`)
      .catch(() => {});

    res.json({
      token: pair.accessToken,
      refresh_token: pair.refreshToken,
      refresh_expires_at: pair.refreshExpiresAt,
    });
  } catch (err) {
    console.error('OAuth exchange error:', err.message);
    res.status(500).json({ error: 'Exchange failed' });
  }
});

module.exports = router;

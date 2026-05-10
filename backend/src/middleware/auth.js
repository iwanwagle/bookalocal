const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { getRedis } = require('../config/redis');

// ─── User cache (Redis-backed) ────────────────────────────────────────────
// Eliminates a DB round-trip on every authenticated request, AND works across
// horizontally-scaled instances. Falls back to a per-process shim if
// REDIS_URL is unset (see config/redis.js).
//
// TTL: 60s — short enough that role / suspension changes propagate quickly,
// long enough to absorb most request bursts. Cache is also explicitly
// invalidated on password reset, suspension toggle, and email verify.

const CACHE_TTL_MS = 60 * 1000;
const cacheKey = (userId) => `user:${userId}`;

const getCachedUser = async (userId) => {
  try {
    const raw = await getRedis().get(cacheKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    // Treat cache failure as a miss — auth still works, just slower.
    console.error('user cache get error:', err.message);
    return null;
  }
};

const setCachedUser = async (userId, user) => {
  try {
    await getRedis().set(cacheKey(userId), JSON.stringify(user), 'PX', CACHE_TTL_MS);
  } catch (err) {
    console.error('user cache set error:', err.message);
  }
};

const invalidateUserCache = async (userId) => {
  try { await getRedis().del(cacheKey(userId)); } catch {}
};

// ─── Cookie helper ─────────────────────────────────────────────────────────
// We accept the access token from either:
//   1. The "bl_access" httpOnly cookie (preferred — set by the server on login)
//   2. The Authorization: Bearer header (kept for non-browser API clients)
const extractAccessToken = (req) => {
  if (req.cookies?.bl_access) return req.cookies.bl_access;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  return null;
};

// ─── Middleware ────────────────────────────────────────────────────────────

const authenticate = async (req, res, next) => {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = await getCachedUser(decoded.userId);
    if (!user) {
      const result = await query(
        'SELECT id, email, first_name, last_name, role, is_active, is_verified, avatar_url FROM users WHERE id = $1',
        [decoded.userId]
      );
      if (!result.rows.length || !result.rows[0].is_active) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }
      user = result.rows[0];
      await setCachedUser(decoded.userId, user);
    }
    if (!user.is_active) {
      await invalidateUserCache(decoded.userId);
      return res.status(401).json({ error: 'Account suspended' });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    if (error.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    next(error);
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = extractAccessToken(req);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      let user = await getCachedUser(decoded.userId);
      if (!user) {
        const result = await query(
          'SELECT id, email, role, is_active, is_verified, avatar_url, first_name, last_name FROM users WHERE id = $1',
          [decoded.userId]
        );
        if (result.rows.length && result.rows[0].is_active) {
          user = result.rows[0];
          await setCachedUser(decoded.userId, user);
        }
      }
      if (user) req.user = user;
    }
  } catch {}
  next();
};

// Reject requests if the user hasn't verified their email yet.
// Place AFTER authenticate and requireRole.
const requireVerified = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.is_verified) {
    return res.status(403).json({
      error: 'Please verify your email before completing this action.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  next();
};

module.exports = { authenticate, requireRole, requireVerified, optionalAuth, invalidateUserCache };

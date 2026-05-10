// Redis client.
//
// Used for two things in this codebase:
//   1. The auth user cache (was an in-memory Map — broke under horizontal scaling).
//   2. The Socket.io adapter (so chat works across multiple Node instances).
//
// If REDIS_URL is not set we fall back to an in-memory shim so local dev and
// tests don't require Redis. The shim implements the small surface we use:
// get / set (with PX expiry) / del / on / connect / quit, plus a duplicate()
// that returns another shim. This is intentionally minimal — anything more
// exotic should fail loudly so we don't accidentally rely on it.
//
// In production, set REDIS_URL=redis://default:password@host:port. Railway has
// a Redis add-on that exposes exactly this variable.

const Redis = require('ioredis');

let primary = null;

const makeShim = () => {
  // In-memory map with TTL — only used when REDIS_URL is unset.
  const store = new Map();
  const expiry = new Map();
  const checkExpired = (key) => {
    const exp = expiry.get(key);
    if (exp && Date.now() > exp) {
      store.delete(key);
      expiry.delete(key);
      return true;
    }
    return false;
  };
  return {
    isShim: true,
    async get(key) {
      if (checkExpired(key)) return null;
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value, ...args) {
      store.set(key, value);
      // Support: SET key value PX ms  /  SET key value EX seconds
      const pxIdx = args.findIndex((a) => String(a).toUpperCase() === 'PX');
      const exIdx = args.findIndex((a) => String(a).toUpperCase() === 'EX');
      if (pxIdx >= 0 && args[pxIdx + 1]) {
        expiry.set(key, Date.now() + Number(args[pxIdx + 1]));
      } else if (exIdx >= 0 && args[exIdx + 1]) {
        expiry.set(key, Date.now() + Number(args[exIdx + 1]) * 1000);
      } else {
        expiry.delete(key);
      }
      return 'OK';
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) { if (store.delete(k)) n++; expiry.delete(k); }
      return n;
    },
    async quit() { store.clear(); expiry.clear(); return 'OK'; },
    duplicate() { return makeShim(); },
    on() { /* no-op */ },
  };
};

const getRedis = () => {
  if (primary) return primary;

  if (!process.env.REDIS_URL) {
    console.warn('⚠️  REDIS_URL not set — using in-memory shim. Do NOT run this in production with multiple instances.');
    primary = makeShim();
    return primary;
  }

  primary = new Redis(process.env.REDIS_URL, {
    // Reasonable defaults for a serverless/Railway setup
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    // Reconnect with exponential backoff capped at 5s
    retryStrategy(times) { return Math.min(times * 200, 5000); },
  });

  primary.on('error', (err) => {
    // Don't crash on Redis hiccups — auth middleware tolerates a missed cache.
    console.error('Redis error:', err.message);
  });
  primary.on('connect', () => console.log('🔌 Redis connected'));

  return primary;
};

// Always return a fresh duplicate for Socket.io adapter pub/sub.
// (You cannot share the same connection that's running other commands.)
const duplicateRedis = () => {
  const r = getRedis();
  return r.duplicate();
};

module.exports = { getRedis, duplicateRedis };

require('dotenv').config();

// Sentry must be initialised before other requires so it can patch http/express.
// Falls back to a no-op if SENTRY_DSN is not set, so local dev isn't affected.
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const { pool } = require('./config/database');
const { duplicateRedis } = require('./config/redis');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const guideRoutes = require('./routes/guides');
const listingRoutes = require('./routes/listings');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/uploads');
const chatRoutes = require('./routes/chat');
const { errorHandler } = require('./middleware/errorHandler');
const { startCronJobs } = require('./utils/cron');
const passport = require('passport');
const oauthRoutes = require('./routes/oauth');
const { setupSocketHandlers } = require('./utils/socketHandlers');

const app = express();

// Sentry request + tracing handlers must be the FIRST middleware on the app
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// Trust the first reverse proxy (Railway, Vercel, Cloudflare).
// Required for: secure cookies, correct req.ip, rate limiter keying on real IP.
app.set('trust proxy', 1);

const server = http.createServer(app);

// Allow either an exact origin or a comma-separated allowlist.
// Cookies require credentials: true on both server and client AND a specific
// origin (not "*") in Access-Control-Allow-Origin.
const allowedOrigins = (process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map((s) => s.trim()).filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow same-origin / curl / mobile (no Origin header)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
};

const io = new Server(server, {
  cors: corsOptions,
});

// Socket.io Redis adapter — required for chat to work across multiple Node
// instances. Without it, a message sent by user A on instance 1 is invisible
// to user B if they're connected to instance 2.
//
// In dev with no REDIS_URL, the in-memory shim runs but provides no real
// pub/sub; chat will work only on a single instance, which is fine for dev.
try {
  const pubClient = duplicateRedis();
  const subClient = duplicateRedis();
  if (!pubClient.isShim) {
    Promise.all([pubClient.connect?.(), subClient.connect?.()].filter(Boolean))
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('🔌 Socket.io Redis adapter attached');
      })
      .catch((err) => console.error('Socket.io adapter setup failed:', err.message));
  } else {
    console.warn('⚠️  Socket.io is using in-memory adapter (no REDIS_URL). Single-instance only.');
  }
} catch (err) {
  console.error('Failed to attach Socket.io Redis adapter:', err.message);
}

// Security middleware
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Cookies — used by the auth flow (bl_access, bl_refresh)
app.use(cookieParser());

// CORS
app.use(cors(corsOptions));

// Global rate limiter — applied to all API routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Strict limiter for login — prevents brute-force / credential-stuffing attacks.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many uploads. Please wait an hour and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many signup attempts from this IP. Please wait an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset attempts. Please wait an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const oauthExchangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many OAuth exchange attempts.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Passport init (for Google OAuth)
app.use(passport.initialize());

// Body parsing — webhook route needs raw body
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check — used by load balancers & uptime monitors.
app.get('/health', async (req, res) => {
  const start = Date.now();
  try {
    const dbCheck = pool.query('SELECT 1');
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB timeout')), 1000)
    );
    await Promise.race([dbCheck, timeout]);
    res.json({
      status: 'ok',
      db: 'ok',
      uptime: Math.round(process.uptime()),
      latency_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      db: 'unreachable',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
app.post('/api/auth/login', authLimiter);
app.post('/api/auth/register', signupLimiter);
app.post('/api/auth/forgot-password', passwordResetLimiter);
app.post('/api/auth/reset-password', passwordResetLimiter);
app.post('/api/auth/oauth/exchange', oauthExchangeLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/guides', guideRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/bookings', writeLimiter, bookingRoutes);
app.use('/api/reviews', writeLimiter, reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadLimiter, uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/auth', oauthRoutes);

// Socket.io for real-time chat
setupSocketHandlers(io);
app.set('io', io);

// Sentry error handler — must come BEFORE any other error middleware
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Bookalocal API running on port ${PORT}`);
  startCronJobs();
  console.log(`📦 Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  server.close(() => process.exit(0));
});

module.exports = { app, server };

// Cookie helpers for the access + refresh token pattern.
//
// The flow:
//   - bl_access  (httpOnly) — short-lived JWT, ~15 min, used by every API request
//   - bl_refresh (httpOnly) — opaque random string, 30 days, used ONLY by /auth/refresh
//
// Both are httpOnly so XSS in the SPA can't read them. SameSite=Lax is the
// pragmatic default — Strict breaks OAuth redirect flows, None requires
// explicit cross-site handling. Lax is fine here because we're not vulnerable
// to login-CSRF (login requires a password) and state-changing endpoints
// require a valid access token in the bl_access cookie which Lax permits.
//
// In production behind a reverse proxy, app.set('trust proxy', 1) must be set
// for `secure` cookies to work correctly.

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;             // 15 min
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days

const isProd = () => process.env.NODE_ENV === 'production';

// If the app is served from app.example.com and the API from api.example.com
// you can set COOKIE_DOMAIN=.example.com so the cookie applies to both.
// Leave unset for local dev (cookies default to the request hostname).
const cookieDomain = () => process.env.COOKIE_DOMAIN || undefined;

const baseOpts = () => ({
  httpOnly: true,
  secure: isProd(),
  sameSite: 'lax',
  domain: cookieDomain(),
  path: '/',
});

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  res.cookie('bl_access', accessToken, {
    ...baseOpts(),
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  // Refresh token cookie is scoped to /api/auth so it doesn't get sent on
  // every API call — it's only needed by /auth/refresh and /auth/logout.
  res.cookie('bl_refresh', refreshToken, {
    ...baseOpts(),
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie('bl_access', { ...baseOpts() });
  res.clearCookie('bl_refresh', { ...baseOpts(), path: '/api/auth' });
};

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
};

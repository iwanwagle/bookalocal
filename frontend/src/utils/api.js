import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// In-memory access token. NOT in localStorage — that was XSS-readable.
// On a fresh page load this is null; the app calls /auth/refresh which uses
// the bl_refresh httpOnly cookie to mint a new access token, then stores it
// here in memory.
let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; };

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  // withCredentials sends the bl_access and bl_refresh cookies.
  // The server's CORS config has credentials: true and a specific origin.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the in-memory access token as a Bearer header IF we have one.
// (We don't strictly need this when the bl_access cookie is sent, but it
// covers the brief window after a refresh before the cookie has been
// re-read by the browser, and it's harmless when both are present.)
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// On 401, attempt a single refresh-token swap before logging the user out.
// Concurrent requests during a refresh queue up and resolve once the new
// token lands. The refresh token is sent automatically via cookie.
let isRefreshing = false;
let refreshSubscribers = [];
const subscribeTokenRefresh = (cb) => refreshSubscribers.push(cb);
const onRefreshed = (newToken) => {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
};

const isBrowser = () => typeof window !== 'undefined';

const redirectToLogin = () => {
  if (!isBrowser()) return;
  // Avoid redirect loop if already on an auth page
  const onAuthPage = ['/login', '/register', '/forgot-password', '/reset-password']
    .some((r) => window.location.pathname.startsWith(r));
  if (!onAuthPage) {
    window.location.href = '/login?session=expired';
  }
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (!isBrowser()) return Promise.reject(error);

    const originalRequest = error.config;
    const status = error.response?.status;
    const isRefreshCall = originalRequest?.url?.includes('/auth/refresh');
    const isLoginCall = originalRequest?.url?.includes('/auth/login');

    // Anything other than a 401 on a normal request — just bubble.
    if (status !== 401 || isLoginCall || isRefreshCall || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          if (!newToken) return reject(error);
          if (newToken) originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;
    try {
      // Refresh: cookie carries the refresh token. Server returns the new
      // access token in the body for in-memory use AND sets fresh cookies.
      const { data } = await axios.post(
        `${API_BASE}/auth/refresh`,
        {},
        { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
      );
      // Native clients receive token in body; browsers rely on cookies.
      // We still capture it in memory if the server included it.
      const newToken = data.token || null;
      if (newToken) setAccessToken(newToken);
      onRefreshed(newToken || 'cookie');
      if (newToken) originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshErr) {
      onRefreshed(null);
      clearAccessToken();
      redirectToLogin();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

// ── Auth ──────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
  // Refresh uses the cookie automatically — no body needed.
  refresh: () => axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true }),
  logout: () => api.post('/auth/logout', {}),
  logoutAll: () => api.post('/auth/logout-all'),
  exchangeOAuthCode: (code) => api.post('/auth/oauth/exchange', { code }),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }),
  resendVerification: () => api.post('/auth/resend-verification'),
};

// ── Listings ──────────────────────────────────
export const listingsAPI = {
  search: (params) => api.get('/listings', { params }),
  list: (params) => api.get('/listings', { params }),
  getById: (id) => api.get(`/listings/${id}`),
  delete: (id) => api.delete(`/listings/${id}`),
  featured: () => api.get('/listings/featured'),
  create: (data) => api.post('/listings', data),
  update: (id, data) => api.put(`/listings/${id}`, data),
  getAvailability: (id, month, year) => api.get(`/listings/${id}/availability`, { params: { month, year } }),
  setAvailability: (id, dates) => api.post(`/listings/${id}/availability`, { dates }),
};

// ── Guides ────────────────────────────────────
export const guidesAPI = {
  list: (params) => api.get('/guides', { params }),
  getById: (id) => api.get(`/guides/${id}`),
  submitKYC: (data) => api.post('/guides/kyc', data),
  updateProfile: (data) => api.put('/guides/profile', data),
};

// ── Bookings ──────────────────────────────────
export const bookingsAPI = {
  create: (data) => api.post('/bookings', data),
  list: (params) => api.get('/bookings', { params }),
  getById: (id) => api.get(`/bookings/${id}`),
  updateStatus: (id, status, guide_notes) => api.patch(`/bookings/${id}/status`, { status, guide_notes }),
  cancel: (id, reason) => api.patch(`/bookings/${id}/cancel`, { reason }),
};

// ── Payments ──────────────────────────────────
export const paymentsAPI = {
  createIntent: (booking_id) => api.post('/payments/create-intent', { booking_id }),
  getAdminSummary: (period) => api.get('/payments/summary', { params: { period } }),
};

// ── Reviews ───────────────────────────────────
export const reviewsAPI = {
  create: (data) => api.post('/reviews', data),
  respond: (id, response) => api.post(`/reviews/${id}/response`, { response }),
};

// ── Users ─────────────────────────────────────
export const usersAPI = {
  updateProfile: (data) => api.put('/users/profile', data),
  changePassword: (data) => api.put('/users/password', data),
  getWishlist: () => api.get('/users/wishlist'),
  addWishlist: (id) => api.post(`/users/wishlist/${id}`),
  removeFromWishlist: (id) => api.delete(`/users/wishlist/${id}`),
};

// ── Uploads ───────────────────────────────────
export const uploadsAPI = {
  uploadImage: (fileOrForm) => {
    const fd = fileOrForm instanceof FormData
      ? fileOrForm
      : (() => { const f = new FormData(); f.append('image', fileOrForm); return f; })();
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadImages: (filesOrForm) => {
    const fd = filesOrForm instanceof FormData
      ? filesOrForm
      : (() => { const f = new FormData(); filesOrForm.forEach(file => f.append('images', file)); return f; })();
    return api.post('/uploads/images', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// ── Chat ──────────────────────────────────────
export const chatAPI = {
  getConversations: () => api.get('/chat/conversations'),
  getMessages: (id) => api.get(`/chat/conversations/${id}/messages`),
  createConversation: (data) => api.post('/chat/conversations', data),
  getUnreadCount: () => api.get('/chat/unread-count'),
};

// ── Admin ─────────────────────────────────────
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getPendingListings: (params) => api.get('/admin/listings/pending', { params }),
  approveListing: (id, notes) => api.patch(`/admin/listings/${id}/approve`, { notes }),
  rejectListing: (id, reason) => api.patch(`/admin/listings/${id}/reject`, { reason }),
  getUsers: (params) => api.get('/admin/users', { params }),
  toggleUserActive: (id) => api.patch(`/admin/users/${id}/toggle-active`),
  getBookings: (params) => api.get('/admin/bookings', { params }),
  getKycPending: (params) => api.get('/admin/kyc-pending', { params }),
  getAnalytics: (days) => api.get('/admin/analytics', { params: { days } }),
  getRevenueSummary: (period) => api.get('/payments/summary', { params: { period } }),
};

export default api;

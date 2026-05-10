import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authAPI, setAccessToken, clearAccessToken } from '../utils/api';

// Auth store. Single source of truth.
//
// What's persisted to localStorage: ONLY the user object (non-sensitive UI hint
// so we can render the navbar etc. on first paint without a flash of "logged
// out"). Tokens are NOT persisted — the access token lives in module memory
// (via setAccessToken in api.js) and the refresh token lives in an httpOnly
// cookie the JS layer can't read.
//
// On a fresh page load:
//   1. Zustand rehydrates the persisted user (immediate).
//   2. App boot calls bootstrapAuth() which calls /auth/refresh — the
//      bl_refresh cookie does the work, we get a new in-memory access token,
//      and we re-fetch the user via /auth/me to confirm we're still logged in.
//   3. If refresh fails, we clear the user and redirect to login.

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isHydrated: false,

      // Called after the first refresh attempt on app boot has resolved (succeed or fail).
      _setHydrated: () => set({ isHydrated: true }),

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authAPI.login({ email, password });
          // Native clients receive a token in the body. Browsers don't —
          // the server set the bl_access cookie and that's enough for axios
          // (with withCredentials) to authenticate. We still store any token
          // we receive so the Authorization-header path keeps working too.
          if (data.token) setAccessToken(data.token);
          const user = { ...data.user, name: `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() };
          set({ user, isAuthenticated: true, isLoading: false });
          return { success: true, user };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (userData) => {
        set({ isLoading: true });
        try {
          const { data } = await authAPI.register(userData);
          if (data.token) setAccessToken(data.token);
          const user = { ...data.user, name: `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() };
          set({ user, isAuthenticated: true, isLoading: false });
          return { success: true, user };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try { await authAPI.logout(); } catch {}
        clearAccessToken();
        set({ user: null, isAuthenticated: false });
        if (typeof window !== 'undefined') window.location.href = '/';
      },

      refreshUser: async () => {
        try {
          const { data } = await authAPI.me();
          const user = { ...data, name: `${data.first_name || ''} ${data.last_name || ''}`.trim() };
          set({ user, isAuthenticated: true });
        } catch {
          clearAccessToken();
          set({ user: null, isAuthenticated: false });
        }
      },

      updateUser: (updates) => set((state) => ({ user: { ...state.user, ...updates } })),
    }),
    {
      name: 'bl-auth',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : null)),
      // Only the user object is persisted. NO token of any kind.
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

/**
 * Call this once on app boot. Tries to mint a fresh access token using the
 * bl_refresh cookie. If that succeeds, also re-fetches the user. If it fails,
 * clears any stale persisted user.
 *
 * Safe to call when not logged in — a 401 from /auth/refresh just sets us to
 * the logged-out state without redirecting (so anonymous pages keep working).
 */
export const bootstrapAuth = async () => {
  const store = useAuthStore.getState();
  try {
    const { data } = await authAPI.refresh();
    if (data?.token) setAccessToken(data.token);
    // Either we got a token in the body OR the cookies were refreshed —
    // either way, /auth/me should now succeed if we have a session.
    await store.refreshUser();
  } catch {
    clearAccessToken();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  } finally {
    useAuthStore.setState({ isHydrated: true });
  }
};

// Helper hooks
export const useUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated);
export const useUserRole = () => useAuthStore((s) => s.user?.role);
export const useAuthHydrated = () => useAuthStore((s) => s.isHydrated);

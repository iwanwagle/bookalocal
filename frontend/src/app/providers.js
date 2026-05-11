'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CurrencyProvider } from '../context/currencyContext';
import { I18nProvider } from '../context/i18nContext';
import { Toaster } from 'react-hot-toast';
import { bootstrapAuth } from '../context/authStore';

export default function Providers({ children }) {
  // Create the QueryClient lazily on the client so it isn't shared across
  // server requests (data leakage) or serialized into client props.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 60 * 5, retry: 1 },
    },
  }));

  // Bootstrap auth on mount. Calls /auth/refresh which uses the bl_refresh
  // httpOnly cookie. If we have a valid session, we get a fresh in-memory
  // access token and the user is restored. If not, we silently fall back to
  // the logged-out state — anonymous pages keep working.
  useEffect(() => {
    bootstrapAuth();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        <I18nProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: { fontFamily: 'var(--font-dm-sans)', borderRadius: '12px', fontSize: '14px' },
              success: { iconTheme: { primary: '#E85A1E', secondary: '#fff' } },
            }}
          />
        </I18nProvider>
      </CurrencyProvider>
    </QueryClientProvider>
  );
}

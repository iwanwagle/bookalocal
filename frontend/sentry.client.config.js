// Sentry client-side initialization for Next.js.
// This file is auto-loaded by @sentry/nextjs on the browser.
// It's a no-op if NEXT_PUBLIC_SENTRY_DSN isn't set, so local dev is unaffected.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Don't send personal info accidentally captured in URLs
    beforeSend(event) {
      if (event.request?.url) {
        // strip ?token=... from URLs
        try {
          const u = new URL(event.request.url);
          u.searchParams.delete('token');
          event.request.url = u.toString();
        } catch {}
      }
      return event;
    },
  });
}

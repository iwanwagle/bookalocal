'use client';
import { useState } from 'react';
import { authAPI } from '@/utils/api';
import { useUser, useIsAuthenticated } from '@/context/authStore';
import toast from 'react-hot-toast';

export default function VerificationBanner() {
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Don't render unless: signed in, has loaded user data, and is_verified is explicitly false
  if (!isAuth || !user || user.is_verified !== false || dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      await authAPI.resendVerification();
      toast.success('Verification email sent. Check your inbox.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send. Please try again.');
    } finally { setSending(false); }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-800 min-w-0">
          <span aria-hidden="true">✉️</span>
          <span className="truncate">
            <strong>Verify your email</strong> to book experiences and write reviews.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={resend}
            disabled={sending}
            className="text-xs font-medium text-amber-800 underline hover:text-amber-900 disabled:opacity-50 whitespace-nowrap"
          >
            {sending ? 'Sending…' : 'Resend email'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-amber-700 hover:text-amber-900 p-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

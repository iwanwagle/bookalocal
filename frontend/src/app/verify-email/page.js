'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/utils/api';
import { useAuthStore } from '@/context/authStore';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { refreshUser } = useAuthStore();

  // states: pending | success | invalid | missing
  const [status, setStatus] = useState(token ? 'pending' : 'missing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    authAPI.verifyEmail(token)
      .then(async () => {
        setStatus('success');
        // Refresh user info so Navbar/banner updates immediately
        try { await refreshUser(); } catch {}
        setTimeout(() => router.push('/dashboard'), 2500);
      })
      .catch((err) => {
        setStatus('invalid');
        setErrorMsg(err.response?.data?.error || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-8 text-center">
        {status === 'pending' && (
          <>
            <div className="w-12 h-12 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verifying…</h1>
            <p className="text-gray-500">Just a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Email verified! 🎉</h1>
            <p className="text-gray-500 mb-4">Redirecting you to your dashboard…</p>
            <Link href="/dashboard" className="text-brand-orange hover:underline text-sm">Go now →</Link>
          </>
        )}

        {status === 'invalid' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification failed</h1>
            <p className="text-gray-500 mb-6">{errorMsg}</p>
            <p className="text-sm text-gray-500 mb-4">
              Already signed in? Go to your dashboard and click "Resend verification email".
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/dashboard" className="btn-secondary px-5 py-2 text-sm">Dashboard</Link>
              <Link href="/login" className="btn-primary px-5 py-2 text-sm">Sign in</Link>
            </div>
          </>
        )}

        {status === 'missing' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Missing verification token</h1>
            <p className="text-gray-500 mb-6">
              This page expects a token from your verification email. Please open the link from your inbox.
            </p>
            <Link href="/dashboard" className="btn-primary px-6 py-2.5 inline-block">Go to dashboard</Link>
          </>
        )}
      </div>
    </div>
  );
}

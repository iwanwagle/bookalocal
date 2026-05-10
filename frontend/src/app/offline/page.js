'use client';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-8 text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656m-2.828 8.485a9 9 0 01-2.829-12.728" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You're offline</h1>
        <p className="text-gray-500 mb-6">Check your connection and try again. Cached pages should still work.</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary px-6 py-2.5 mr-2"
        >
          Try again
        </button>
        <Link href="/" className="btn-ghost px-6 py-2.5 inline-block">
          Go home
        </Link>
      </div>
    </div>
  );
}

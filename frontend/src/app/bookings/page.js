'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { bookingsAPI } from '@/utils/api';
import { useIsAuthenticated, useUser } from '@/context/authStore';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { format } from 'date-fns';

const STATUS_STYLES = {
  pending:   { label: 'Pending',   bg: 'bg-yellow-50',  text: 'text-yellow-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-50',    text: 'text-blue-700' },
  completed: { label: 'Completed', bg: 'bg-green-50',   text: 'text-green-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100',   text: 'text-gray-600' },
  rejected:  { label: 'Rejected',  bg: 'bg-red-50',     text: 'text-red-700' },
};

export default function BookingsListPage() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    // Guides have a dedicated dashboard for managing bookings; redirect them there
    if (user?.role === 'guide') { router.push('/guide/dashboard'); return; }
    if (user?.role === 'admin') { router.push('/admin'); return; }

    bookingsAPI.list()
      .then(({ data }) => setBookings(data.bookings || []))
      .finally(() => setLoading(false));
  }, [isAuth, user, router]);

  const filtered = bookings.filter((b) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return ['pending', 'confirmed'].includes(b.status);
    if (filter === 'past') return ['completed', 'cancelled', 'rejected'].includes(b.status);
    return b.status === filter;
  });

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="mb-6">
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-1">My bookings</h1>
            <p className="text-gray-500">{bookings.length} total</p>
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {[
              { id: 'all',       label: 'All' },
              { id: 'upcoming',  label: 'Upcoming' },
              { id: 'past',      label: 'Past' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                  filter === f.id
                    ? 'bg-brand-orange text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-card p-5">
                  <div className="skeleton h-5 w-3/4 mb-2" />
                  <div className="skeleton h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card p-12 text-center">
              <div className="text-5xl mb-4">📅</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {filter === 'all' ? 'No bookings yet' : `No ${filter} bookings`}
              </h2>
              <p className="text-gray-500 mb-6">
                {filter === 'all' ? 'Find a local guide and start your next adventure.' : 'Try a different filter.'}
              </p>
              {filter === 'all' && (
                <Link href="/search" className="btn-primary px-6 py-2.5 inline-block">
                  Browse experiences →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((b) => {
                const s = STATUS_STYLES[b.status] || STATUS_STYLES.pending;
                const date = b.booking_date ? format(new Date(b.booking_date), 'EEE, MMM d, yyyy') : '—';
                const isPaymentNeeded = b.status === 'pending' && b.payment_status !== 'paid';
                return (
                  <Link
                    key={b.id}
                    href={isPaymentNeeded ? `/bookings/${b.id}/checkout` : `/bookings/${b.id}/confirmation`}
                    className="block bg-white rounded-2xl shadow-card p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      {b.cover_image && (
                        <img src={b.cover_image} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900 truncate">{b.listing_title}</h3>
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap ${s.bg} ${s.text}`}>
                            {s.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mb-1">with {b.guide_first} {b.guide_last}</p>
                        <p className="text-sm text-gray-700">{date} · {b.num_persons} {b.num_persons === 1 ? 'person' : 'people'}</p>
                        <p className="text-xs text-gray-400 mt-1 font-mono">{b.booking_ref}</p>
                        {isPaymentNeeded && (
                          <p className="text-xs text-amber-700 mt-2 font-medium">⚠ Complete payment to confirm</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

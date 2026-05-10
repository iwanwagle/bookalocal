'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { bookingsAPI, usersAPI } from '@/utils/api';
import { useUser, useIsAuthenticated, useAuthStore } from '@/context/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-gray-100 text-gray-600',
};

export default function TravelerDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const { logout } = useAuthStore();
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    if (user?.role === 'guide') { router.push('/guide/dashboard'); return; }
    if (user?.role === 'admin') { router.push('/admin'); return; }
    if (params.get('payment') === 'success') toast.success('Payment confirmed! Your booking is secured.');
    fetchData();
  }, [isAuth, user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bRes, wRes] = await Promise.all([
        bookingsAPI.list(),
        usersAPI.getWishlist(),
      ]);
      setBookings(bRes.data.bookings || []);
      setWishlist(wRes.data.wishlist || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (bookingId) => {
    if (!confirm('Cancel this booking?')) return;
    try {
      await bookingsAPI.cancel(bookingId);
      toast.success('Booking cancelled');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cannot cancel booking');
    }
  };

  const removeWishlist = async (listingId) => {
    try {
      await usersAPI.removeFromWishlist(listingId);
      setWishlist(wishlist.filter((w) => w.id !== listingId));
      toast.success('Removed from wishlist');
    } catch {
      toast.error('Failed to remove');
    }
  };

  if (!isAuth || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">B</span>
            </div>
            <span className="font-bold text-gray-900">bookalocal</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/search" className="text-sm text-gray-600 hover:text-brand-orange">Explore</Link>
            <button onClick={() => { logout(); router.push('/'); }} className="text-sm text-red-500 hover:text-red-600">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user.first_name || user.name?.split(' ')[0]}! 👋</h1>
          <p className="text-gray-600 mt-1">Manage your bookings and saved experiences</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-8">
          {[
            { key: 'bookings', label: `Bookings (${bookings.length})` },
            { key: 'wishlist', label: `Wishlist (${wishlist.length})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse h-32" />
            ))}
          </div>
        ) : tab === 'bookings' ? (
          <div className="space-y-4">
            {bookings.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-card">
                <p className="text-5xl mb-4">🧭</p>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">No bookings yet</h3>
                <p className="text-gray-500 mb-6">Start exploring Nepal's amazing local guides</p>
                <Link href="/search" className="btn-primary inline-block px-8 py-3">Find Guides</Link>
              </div>
            ) : (
              bookings.map((b) => (
                <div key={b.id} className="bg-white rounded-2xl shadow-card p-6 flex flex-col sm:flex-row gap-4">
                  {b.listing_image && (
                    <img src={b.cover_image} alt={b.listing_title} className="w-full sm:w-24 h-24 rounded-xl object-cover" />
                  )}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-gray-900">{b.listing_title}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-600'}`}>
                        {b.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">Guide: {b.guide_first} {b.guide_last}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                      <span>📅 {b.booking_date ? format(new Date(b.booking_date), 'MMM d, yyyy') : '—'}</span>
                      <span>👥 {b.num_persons} person{b.num_persons > 1 ? 's' : ''}</span>
                      <span>💰 NPR {b.platform_commission?.toLocaleString()} paid ({b.payment_status})</span>
                    </div>
                  </div>
                  <div className="flex flex-row sm:flex-col gap-2 justify-end">
                    {b.payment_status !== 'paid' && (
                      <Link href={`/bookings/${b.id}/checkout`} className="btn-primary text-sm px-4 py-2 text-center whitespace-nowrap">
                        Pay Now
                      </Link>
                    )}
                    {b.status === 'completed' && (
                      <Link href={`/listings/${b.listing_id}#review`} className="btn-secondary text-sm px-4 py-2 text-center">
                        Leave Review
                      </Link>
                    )}
                    {['pending', 'confirmed'].includes(b.status) && (
                      <button onClick={() => cancelBooking(b.id)} className="text-sm text-red-500 hover:text-red-700 px-4 py-2 border border-red-200 rounded-xl">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {wishlist.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-white rounded-2xl shadow-card">
                <p className="text-5xl mb-4">❤️</p>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Your wishlist is empty</h3>
                <p className="text-gray-500 mb-6">Save guides and experiences you love</p>
                <Link href="/search" className="btn-primary inline-block px-8 py-3">Explore Guides</Link>
              </div>
            ) : (
              wishlist.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl shadow-card overflow-hidden group">
                  <div className="relative h-48">
                    <img src={item.cover_image || item.images?.[0] || '/placeholder.jpg'} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <button
                      onClick={() => removeWishlist(item.id)}
                      className="absolute top-3 right-3 bg-white rounded-full p-2 shadow text-red-500 hover:bg-red-50"
                    >
                      ♥
                    </button>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{item.title}</h3>
                    <p className="text-sm text-gray-500 mb-3">{item.location}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-brand-orange">NPR {(item.price_per_day || item.price_per_hour || item.package_price)?.toLocaleString()}</span>
                      <Link href={`/listings/${item.id}`} className="btn-primary text-sm px-4 py-2">View</Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

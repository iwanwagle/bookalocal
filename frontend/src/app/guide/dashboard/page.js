'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { bookingsAPI, listingsAPI, uploadsAPI, guidesAPI } from '@/utils/api';
import { useUser, useIsAuthenticated, useAuthStore } from '@/context/authStore';
import toast from 'react-hot-toast';
import AvailabilityCalendar from '@/components/common/AvailabilityCalendar';
import { format } from 'date-fns';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-gray-100 text-gray-600',
};

const LISTING_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function GuideDashboard() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const { logout, updateUser } = useAuthStore();
  const [tab, setTab] = useState('bookings');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ bio: '', phone: '' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ total: 0, confirmed: 0, completed: 0, earnings: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    if (user?.role === 'traveler') { router.push('/dashboard'); return; }
    if (user?.role === 'admin') { router.push('/admin'); return; }
    fetchData();
  }, [isAuth, user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bRes, lRes] = await Promise.all([
        bookingsAPI.list(),
        listingsAPI.list({ limit: 50 }),
      ]);
      const bks = bRes.data.bookings || [];
      setBookings(bks);
      setListings(lRes.data.listings || []);

      const completed = bks.filter((b) => b.status === 'completed');
      const confirmed = bks.filter((b) => b.status === 'confirmed');
      const earnings = completed.reduce((sum, b) => sum + (b.guide_amount || (b.total_amount || 0) * 0.85), 0);
      setStats({ total: bks.length, confirmed: confirmed.length, completed: completed.length, earnings });
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await uploadsAPI.uploadImage(fd);
      await guidesAPI.updateProfile({ avatar_url: data.url });
      updateUser({ avatar_url: data.url });
      toast.success('Profile photo updated!');
    } catch { toast.error('Upload failed'); }
    finally { setUploadingAvatar(false); }
  };

  const saveProfile = async () => {
    try {
      await guidesAPI.updateProfile({ bio: profileForm.bio });
      updateUser({ bio: profileForm.bio });
      setEditingProfile(false);
      toast.success('Profile saved!');
    } catch { toast.error('Failed to save'); }
  };

  const updateBookingStatus = async (bookingId, status) => {
    try {
      await bookingsAPI.updateStatus(bookingId, status);
      toast.success(`Booking ${status}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  };

  const deleteListing = async (listingId) => {
    if (!confirm('Delete this listing?')) return;
    try {
      await listingsAPI.delete(listingId);
      toast.success('Listing deleted');
      setListings(listings.filter((l) => l.id !== listingId));
    } catch {
      toast.error('Failed to delete listing');
    }
  };

  if (!isAuth || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">B</span>
            </div>
            <span className="font-bold text-gray-900">bookalocal</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/search" className="text-sm text-gray-600 hover:text-brand-orange">View Marketplace</Link>
            <button onClick={() => { logout(); router.push('/'); }} className="text-sm text-red-500">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Guide Dashboard</h1>
            <p className="text-gray-600">Welcome back, {user.first_name || user.name?.split(' ')[0]}!</p>
          </div>
          <Link href="/guide/listings/new" className="btn-primary px-6 py-3">
            + New Listing
          </Link>
        </div>

        {/* Onboarding banner if profile is incomplete */}
        {!user.bio && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-800">Complete your guide profile</p>
              <p className="text-sm text-amber-600 mt-0.5">Add your bio, languages, and location to start getting bookings.</p>
            </div>
            <Link href="/guide/onboarding" className="btn-primary text-sm px-5 py-2 whitespace-nowrap">
              Complete profile →
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Bookings', value: stats.total, icon: '📋', color: 'text-blue-600' },
            { label: 'Confirmed', value: stats.confirmed, icon: '✅', color: 'text-green-600' },
            { label: 'Completed', value: stats.completed, icon: '🏆', color: 'text-purple-600' },
            { label: 'Total Earnings', value: `NPR ${Math.round(stats.earnings).toLocaleString()}`, icon: '💰', color: 'text-brand-orange' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-white rounded-2xl shadow-card p-5">
              <span className="text-2xl mb-2 block">{icon}</span>
              <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
              <div className="text-sm text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
          {[
            { key: 'bookings', label: `Requests (${bookings.filter(b => b.status === 'pending').length})` },
            { key: 'all-bookings', label: 'All Bookings' },
            { key: 'listings', label: `Listings (${listings.length})` },
            { key: 'availability', label: '📅 Availability' },
            { key: 'profile', label: '👤 Profile' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}
          </div>
        ) : tab === 'bookings' ? (
          // Pending requests
          <div className="space-y-4">
            {bookings.filter(b => b.status === 'pending').length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl shadow-card">
                <p className="text-4xl mb-3">✨</p>
                <p className="text-gray-600">No pending requests right now.</p>
              </div>
            ) : (
              bookings.filter(b => b.status === 'pending').map((b) => (
                <div key={b.id} className="bg-white rounded-2xl shadow-card p-6 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2 items-start justify-between mb-2">
                      <h3 className="font-bold text-gray-900">{b.listing_title}</h3>
                      <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-semibold">New Request</span>
                    </div>
                    <p className="text-sm font-medium text-gray-700">Traveler: {b.traveler_first} {b.traveler_last}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-1">
                      <span>📅 {b.booking_date ? format(new Date(b.booking_date), 'MMM d, yyyy') : '—'}</span>
                      <span>👥 {b.persons} person{b.persons > 1 ? 's' : ''}</span>
                      <span>💰 NPR {b.total_amount?.toLocaleString()}</span>
                      {b.special_requests && <span>📝 "{b.special_requests}"</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => updateBookingStatus(b.id, 'confirmed')} className="btn-primary px-5 py-2 text-sm">
                      Accept
                    </button>
                    <button onClick={() => updateBookingStatus(b.id, 'rejected')} className="px-5 py-2 text-sm border border-red-200 text-red-500 rounded-xl hover:bg-red-50">
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : tab === 'all-bookings' ? (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl">
                <p className="text-gray-500">No bookings yet.</p>
              </div>
            ) : (
              bookings.map((b) => (
                <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{b.listing_title}</p>
                    <p className="text-sm text-gray-500">{b.traveler_name} • {b.booking_date ? format(new Date(b.booking_date), 'MMM d') : '—'} • {b.persons} pax</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">NPR {b.total_amount?.toLocaleString()}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[b.status] || ''}`}>{b.status}</span>
                    {b.status === 'confirmed' && (
                      <button onClick={() => updateBookingStatus(b.id, 'completed')} className="text-xs text-green-600 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-50">
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // Availability tab
        ) : tab === 'availability' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Set Your Availability</h2>
              <p className="text-sm text-gray-500 mb-5">Click dates to mark when you're available. Travellers only see available dates when booking.</p>
              {listings.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">Create a listing first to manage its availability.</p>
                  <Link href="/guide/listings/new" className="btn-primary inline-block mt-3 px-6 py-2 text-sm">Create Listing</Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {listings.map((l) => (
                    <div key={l.id}>
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand-orange inline-block" />
                        {l.title}
                      </h3>
                      <AvailabilityCalendar listingId={l.id} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === 'profile' ? (
          <div className="space-y-6">
            {/* Avatar */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Profile Photo</h2>
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-brand-orange overflow-hidden flex items-center justify-center">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={user.first_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-3xl font-bold">{user?.first_name?.[0]}</span>
                    )}
                  </div>
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="btn-secondary text-sm px-4 py-2 cursor-pointer inline-block">
                    {uploadingAvatar ? 'Uploading…' : 'Change photo'}
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} className="hidden" />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">JPG or PNG, max 5MB. Square photos work best.</p>
                </div>
              </div>
            </div>

            {/* Bio */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">About you</h2>
                {!editingProfile ? (
                  <button onClick={() => { setProfileForm({ bio: user?.bio || '' }); setEditingProfile(true); }} className="btn-secondary text-sm px-4 py-2">
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingProfile(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                    <button onClick={saveProfile} className="btn-primary text-sm px-4 py-2">Save</button>
                  </div>
                )}
              </div>
              {editingProfile ? (
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  rows={5}
                  className="input-field resize-none"
                  placeholder="Tell travelers about yourself, your experience, and what makes your tours special…"
                />
              ) : (
                <p className="text-gray-600 leading-relaxed">
                  {user?.bio || <span className="text-gray-400 italic">No bio yet — add one to get more bookings.</span>}
                </p>
              )}
            </div>

            {/* KYC */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Identity Verification</h2>
              <p className="text-sm text-gray-500 mb-4">Get a verified badge to build trust with travelers.</p>
              {user?.id_verified ? (
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Identity verified ✓
                </div>
              ) : (
                <Link href="/guide/kyc" className="btn-secondary text-sm px-5 py-2 inline-block">
                  Verify my identity →
                </Link>
              )}
            </div>

            {/* Account info */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Account</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium">{user?.first_name} {user?.last_name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-500">Email</span>
                  <span className="font-medium">{user?.email}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500">Role</span>
                  <span className="capitalize font-medium text-brand-orange">{user?.role}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
        // Listings tab
          <div className="space-y-4">
            {listings.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-card">
                <p className="text-5xl mb-4">🗺️</p>
                <h3 className="text-lg font-semibold mb-2">No listings yet</h3>
                <p className="text-gray-500 mb-6">Create your first listing to start getting bookings</p>
                <Link href="/guide/listings/new" className="btn-primary inline-block px-8 py-3">Create First Listing</Link>
              </div>
            ) : (
              listings.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl shadow-card p-5 flex gap-4">
                  {l.images?.[0] && (
                    <img src={l.images[0]} alt={l.title} className="w-20 h-20 rounded-xl object-cover" />
                  )}
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2 items-start justify-between mb-1">
                      <h3 className="font-bold text-gray-900">{l.title}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${LISTING_STATUS_COLORS[l.status] || ''}`}>
                        {l.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{l.location} • ⭐ {l.average_rating || '—'} ({l.total_reviews || 0} reviews)</p>
                    <p className="text-sm font-semibold text-brand-orange mt-1">NPR {(l.price_per_day || l.price_per_hour || l.package_price)?.toLocaleString()} / {l.pricing_type}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link href={`/guide/listings/${l.id}/edit`} className="text-sm border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 text-center">
                      Edit
                    </Link>
                    <button onClick={() => deleteListing(l.id)} className="text-sm text-red-500 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50">
                      Delete
                    </button>
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

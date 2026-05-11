'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminAPI } from '@/utils/api';
import { useIsAuthenticated, useUser, useAuthStore } from '@/context/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function AdminPanel() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const { logout } = useAuthStore();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [pendingListings, setPendingListings] = useState([]);
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    if (user && user.role !== 'admin') { router.push('/dashboard'); return; }
    fetchAll();
  }, [isAuth, user]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sRes, lRes, uRes, bRes, aRes] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getPendingListings(),
        adminAPI.getUsers(),
        adminAPI.getBookings(),
        adminAPI.getAnalytics(30),
      ]);
      setStats(sRes.data);
      setPendingListings(lRes.data.listings || []);
      setUsers(uRes.data.users || []);
      setBookings(bRes.data.bookings || []);
      setAnalytics(aRes.data);
    } catch (err) {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const approveListing = async (id) => {
    try {
      await adminAPI.approveListing(id);
      toast.success('Listing approved!');
      setPendingListings(pendingListings.filter((l) => l.id !== id));
    } catch { toast.error('Failed'); }
  };

  const rejectListing = async (id) => {
    const reason = prompt('Reason for rejection (optional):') || '';
    try {
      await adminAPI.rejectListing(id, reason);
      toast.success('Listing rejected');
      setPendingListings(pendingListings.filter((l) => l.id !== id));
    } catch { toast.error('Failed'); }
  };

  const toggleUser = async (id) => {
    try {
      await adminAPI.toggleUserActive(id);
      toast.success('User status updated');
      fetchAll();
    } catch { toast.error('Failed'); }
  };

  if (!isAuth || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-brand-orange rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <span className="font-bold">Admin Panel</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">{user.email}</span>
            <button onClick={() => { logout(); router.push('/'); }} className="text-sm text-red-400 hover:text-red-300">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-8">
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'listings', label: `🗺️ Pending (${pendingListings.length})` },
            { key: 'users', label: `👥 Users` },
            { key: 'bookings', label: `📋 Bookings` },
            { key: 'analytics', label: '📈 Analytics' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}
          </div>
        ) : tab === 'overview' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Users', value: stats?.total_users || 0, icon: '👥', color: 'text-blue-600' },
                { label: 'Total Guides', value: stats?.approved_guides || 0, icon: '🧑‍🏫', color: 'text-purple-600' },
                { label: 'Active Listings', value: stats?.total_bookings || 0, icon: '🗺️', color: 'text-green-600' },
                { label: 'Total Bookings', value: stats?.total_bookings || 0, icon: '📋', color: 'text-orange-500' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="bg-white rounded-2xl shadow-card p-5">
                  <span className="text-2xl mb-2 block">{icon}</span>
                  <div className={`text-3xl font-bold ${color} mb-1`}>{value.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">{label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h3 className="font-bold text-gray-900 mb-4">💰 Revenue</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Revenue This Month (15% fees)</span>
                    <span className="text-2xl font-bold text-brand-orange">NPR {(stats?.total_revenue || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Completed bookings</span>
                    <span>{stats?.bookings_30d || 0} (last 30d)</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Pending approval listings</span>
                    <span className="text-yellow-600 font-semibold">{stats?.pending_listings || pendingListings.length}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h3 className="font-bold text-gray-900 mb-4">⚡ Quick Actions</h3>
                <div className="space-y-2">
                  <button onClick={() => setTab('listings')} className="w-full text-left px-4 py-3 bg-yellow-50 text-yellow-800 rounded-xl hover:bg-yellow-100 text-sm font-medium">
                    🔍 Review {pendingListings.length} pending listing{pendingListings.length !== 1 ? 's' : ''}
                  </button>
                  <button onClick={() => setTab('users')} className="w-full text-left px-4 py-3 bg-blue-50 text-blue-800 rounded-xl hover:bg-blue-100 text-sm font-medium">
                    👥 Manage {users.length} users
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : tab === 'listings' ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Pending Listings ({pendingListings.length})</h2>
            {pendingListings.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl shadow-card">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-gray-600">All listings have been reviewed!</p>
              </div>
            ) : (
              pendingListings.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl shadow-card p-6 flex gap-4">
                  {l.images?.[0] && (
                    <img src={l.images[0]} alt={l.title} className="w-24 h-24 rounded-xl object-cover" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 mb-1">{l.title}</h3>
                    <p className="text-sm text-gray-600 mb-1">Guide: {l.first_name} {l.last_name} • {l.city}</p>
                    <p className="text-sm text-gray-500 line-clamp-2">{l.description}</p>
                    <div className="flex gap-3 mt-2 text-sm text-gray-500">
                      <span>💰 NPR {l.price?.toLocaleString()} / {l.pricing_type}</span>
                      <span>🏷️ {l.category}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link href={`/listings/${l.id}`} target="_blank" className="text-sm text-blue-600 hover:underline text-center">Preview</Link>
                    <button onClick={() => approveListing(l.id)} className="btn-primary text-sm px-5 py-2 bg-green-500 hover:bg-green-600">Approve</button>
                    <button onClick={() => rejectListing(l.id)} className="text-sm px-5 py-2 border border-red-200 text-red-500 rounded-xl hover:bg-red-50">Reject</button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : tab === 'users' ? (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Users ({users.length})</h2>
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left p-4 font-semibold text-gray-600">Name</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Email</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Role</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Joined</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-900">{u.first_name} {u.last_name}</td>
                      <td className="p-4 text-gray-600">{u.email}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'guide' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500">{u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="p-4">
                        {u.role !== 'admin' && (
                          <button onClick={() => toggleUser(u.id)} className={`text-xs px-3 py-1.5 rounded-lg border ${u.is_active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">All Bookings ({bookings.length})</h2>
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left p-4 font-semibold text-gray-600">Listing</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Traveler</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Guide</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Date</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Total</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-900 max-w-xs truncate">{b.listing_title}</td>
                      <td className="p-4 text-gray-600">{b.t_first} {b.t_last}</td>
                      <td className="p-4 text-gray-600">{b.g_first} {b.g_last}</td>
                      <td className="p-4 text-gray-500">{b.booking_date ? format(new Date(b.booking_date), 'MMM d, yyyy') : '—'}</td>
                      <td className="p-4 font-semibold">NPR {b.total_amount?.toLocaleString()}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                          b.status === 'completed' ? 'bg-green-100 text-green-700' :
                          b.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                          b.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{b.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

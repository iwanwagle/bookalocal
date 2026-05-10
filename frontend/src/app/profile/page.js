'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usersAPI, uploadsAPI } from '@/utils/api';
import { useIsAuthenticated, useUser, useAuthStore } from '@/context/authStore';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const { updateUser, logout } = useAuthStore();

  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ first_name: '', last_name: '', phone: '' });
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    if (user) {
      setProfile({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        phone: user.phone || '',
      });
    }
  }, [isAuth, user, router]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profile.first_name.trim() || !profile.last_name.trim()) {
      toast.error('Name fields are required'); return;
    }
    setSavingProfile(true);
    try {
      const { data } = await usersAPI.updateProfile(profile);
      updateUser(data);
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save profile');
    } finally { setSavingProfile(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwd.next.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (!/[A-Za-z]/.test(pwd.next) || !/[0-9]/.test(pwd.next)) {
      toast.error('Password must contain a letter and a number'); return;
    }
    if (pwd.next !== pwd.confirm) { toast.error("New passwords don't match"); return; }

    setSavingPwd(true);
    try {
      await usersAPI.changePassword({ current_password: pwd.current, new_password: pwd.next });
      toast.success('Password changed');
      setPwd({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change password');
    } finally { setSavingPwd(false); }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await uploadsAPI.uploadImage(fd);
      // For travelers, avatar lives on users table; we can update via /users/profile if extended,
      // or just write directly. For now use a quick PATCH via profile endpoint extension.
      await usersAPI.updateProfile({ avatar_url: data.url });
      updateUser({ avatar_url: data.url });
      toast.success('Profile photo updated');
    } catch { toast.error('Upload failed'); }
    finally { setUploadingAvatar(false); }
  };

  if (!user) return null;

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        tab === id ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h1 className="font-display text-3xl font-bold text-gray-900 mb-6">Account settings</h1>

          <div className="flex gap-2 mb-6 overflow-x-auto">
            <TabButton id="profile" label="Profile" />
            <TabButton id="security" label="Security" />
            <TabButton id="account" label="Account" />
          </div>

          {tab === 'profile' && (
            <div className="space-y-6">
              {/* Avatar */}
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile photo</h2>
                <div className="flex items-center gap-5">
                  <div className="w-20 h-20 rounded-2xl bg-brand-orange overflow-hidden flex items-center justify-center flex-shrink-0">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.first_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-3xl font-bold">{user.first_name?.[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <label className="btn-secondary text-sm px-4 py-2 cursor-pointer inline-block">
                    {uploadingAvatar ? 'Uploading…' : 'Change photo'}
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Profile form */}
              <form onSubmit={saveProfile} className="bg-white rounded-2xl shadow-card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Personal info</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="fn" className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                    <input id="fn" type="text" value={profile.first_name}
                      onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                      className="input-field" required />
                  </div>
                  <div>
                    <label htmlFor="ln" className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                    <input id="ln" type="text" value={profile.last_name}
                      onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                      className="input-field" required />
                  </div>
                </div>
                <div>
                  <label htmlFor="ph" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input id="ph" type="tel" value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="input-field" placeholder="+977 98XX-XXX-XXX" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={user.email} disabled className="input-field bg-gray-50 text-gray-500 cursor-not-allowed" />
                  <p className="text-xs text-gray-400 mt-1">Email can't be changed. Contact support if you need to update it.</p>
                </div>
                <button type="submit" disabled={savingProfile} className="btn-primary px-6 py-2.5 disabled:opacity-50">
                  {savingProfile ? 'Saving…' : 'Save changes'}
                </button>
              </form>
            </div>
          )}

          {tab === 'security' && (
            <form onSubmit={changePassword} className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Change password</h2>
              <div>
                <label htmlFor="cp" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
                <input id="cp" type="password" value={pwd.current}
                  onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                  className="input-field" required autoComplete="current-password" />
              </div>
              <div>
                <label htmlFor="np" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input id="np" type="password" value={pwd.next}
                  onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                  className="input-field" placeholder="Min. 8 chars, include a number"
                  minLength={8} required autoComplete="new-password" />
              </div>
              <div>
                <label htmlFor="cn" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input id="cn" type="password" value={pwd.confirm}
                  onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                  className="input-field" minLength={8} required autoComplete="new-password" />
              </div>
              <button type="submit" disabled={savingPwd} className="btn-primary px-6 py-2.5 disabled:opacity-50">
                {savingPwd ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}

          {tab === 'account' && (
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Account</h2>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <dt className="text-gray-500">Account type</dt>
                  <dd className="capitalize font-medium text-brand-orange">{user.role}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <dt className="text-gray-500">Member since</dt>
                  <dd className="font-medium">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</dd>
                </div>
              </dl>
              <div className="pt-4 border-t border-gray-100">
                <button onClick={() => { logout(); router.push('/'); }} className="text-sm text-red-600 hover:underline">
                  Log out of all devices
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

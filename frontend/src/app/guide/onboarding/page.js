'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { guidesAPI, uploadsAPI } from '@/utils/api';
import { useIsAuthenticated, useUser, useAuthStore } from '@/context/authStore';
import toast from 'react-hot-toast';

const SPECIALTIES = [
  'hiking', 'trekking', 'city-tour', 'cultural', 'photography',
  'food-tour', 'adventure', 'wildlife', 'spiritual', 'rafting',
  'paragliding', 'mountain-biking', 'birdwatching',
];

const LANGUAGES = ['English', 'Nepali', 'Hindi', 'Chinese', 'French', 'German', 'Spanish', 'Japanese', 'Korean'];

const STEPS = [
  { id: 1, label: 'About you', icon: '👤' },
  { id: 2, label: 'Expertise', icon: '🏔️' },
  { id: 3, label: 'Location', icon: '📍' },
];

export default function GuideOnboardingPage() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const { refreshUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    bio: '',
    years_experience: '',
    languages: ['English', 'Nepali'],
    specialties: [],
    city: 'Kathmandu',
    location: 'Kathmandu, Nepal',
    avatar: null,
    avatarPreview: null,
  });

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    if (user?.role !== 'guide') { router.push('/dashboard'); return; }
  }, [isAuth, user]);

  const f = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const toggleList = (field, value) => {
    setForm((p) => ({
      ...p,
      [field]: p[field].includes(value)
        ? p[field].filter((v) => v !== value)
        : [...p[field], value],
    }));
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const preview = URL.createObjectURL(file);
    f('avatarPreview', preview);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await uploadsAPI.uploadImage(fd);
      f('avatar', data.url);
      toast.success('Photo uploaded!');
    } catch {
      toast.error('Upload failed');
      f('avatarPreview', null);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.bio || form.bio.length < 50) {
      toast.error('Bio must be at least 50 characters');
      return;
    }
    if (!form.languages.length) {
      toast.error('Please select at least one language');
      return;
    }
    setSaving(true);
    try {
      await guidesAPI.updateProfile({
        bio: form.bio,
        years_experience: parseInt(form.years_experience) || 0,
        languages: form.languages,
        specialties: form.specialties,
        city: form.city,
        location: form.location,
        avatar_url: form.avatar,
      });
      await refreshUser();
      toast.success('Profile complete! Let\'s create your first listing.');
      router.push('/guide/listings/new');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const canNext = step === 1
    ? form.bio.length >= 50
    : step === 2
    ? form.languages.length > 0
    : form.city.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="font-bold text-gray-900">bookalocal</span>
          </Link>
          <Link href="/guide/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            Skip for now →
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                step === s.id
                  ? 'bg-brand-orange text-white shadow-sm'
                  : step > s.id
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                <span>{step > s.id ? '✓' : s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${step > s.id ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-card p-8">
          {/* Step 1: About you */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Tell travelers about yourself</h1>
              <p className="text-gray-500 mb-6">A great bio gets 3× more bookings. Be specific about what makes your tours special.</p>

              {/* Avatar */}
              <div className="flex items-center gap-5 mb-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-brand-orange overflow-hidden flex items-center justify-center">
                    {form.avatarPreview ? (
                      <img src={form.avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-3xl font-bold">{user?.first_name?.[0] || 'G'}</span>
                    )}
                  </div>
                  {uploading && (
                    <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="btn-secondary text-sm px-4 py-2 cursor-pointer inline-block">
                    Upload photo
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">JPG or PNG, max 5MB</p>
                </div>
              </div>

              {/* Bio */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your bio <span className="text-gray-400 font-normal">({form.bio.length}/500)</span>
                </label>
                <textarea
                  value={form.bio}
                  onChange={(e) => f('bio', e.target.value.slice(0, 500))}
                  rows={5}
                  placeholder="Hi! I'm a certified mountain guide with 8 years of experience leading treks in the Himalayas. I grew up in Namche Bazaar and know every trail, teahouse, and local story along the Everest region..."
                  className="input-field resize-none"
                />
                <div className={`text-xs mt-1 ${form.bio.length < 50 ? 'text-amber-500' : 'text-green-600'}`}>
                  {form.bio.length < 50 ? `${50 - form.bio.length} more characters needed` : '✓ Good length'}
                </div>
              </div>

              {/* Years experience */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years of experience</label>
                <select value={form.years_experience} onChange={(e) => f('years_experience', e.target.value)} className="input-field">
                  <option value="">Select…</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((y) => (
                    <option key={y} value={y}>{y}+ year{y !== 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Expertise */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Your expertise & languages</h1>
              <p className="text-gray-500 mb-6">Travelers filter by language and specialty — the more you add, the more you'll be found.</p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Languages you guide in</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggleList('languages', lang)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        form.languages.includes(lang)
                          ? 'bg-brand-orange text-white border-brand-orange'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Your specialties <span className="text-gray-400 font-normal">(pick all that apply)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((spec) => (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => toggleList('specialties', spec)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all capitalize ${
                        form.specialties.includes(spec)
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {spec.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Location */}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Where are you based?</h1>
              <p className="text-gray-500 mb-6">Travelers search by location — enter where you operate from.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <select value={form.city} onChange={(e) => f('city', e.target.value)} className="input-field">
                    {['Kathmandu', 'Pokhara', 'Chitwan', 'Lumbini', 'Nagarkot', 'Namche Bazaar', 'Lukla', 'Manang', 'Mustang', 'Bandipur', 'Other'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full location (shown on profile)</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => f('location', e.target.value)}
                    className="input-field"
                    placeholder="e.g. Thamel, Kathmandu, Nepal"
                  />
                </div>
              </div>

              {/* Summary preview */}
              <div className="mt-6 p-4 bg-orange-50 rounded-xl border border-orange-100">
                <p className="text-sm font-semibold text-orange-800 mb-2">Profile preview</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-orange flex items-center justify-center text-white font-bold">
                    {form.avatarPreview
                      ? <img src={form.avatarPreview} className="w-full h-full rounded-full object-cover" alt="" />
                      : user?.first_name?.[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{user?.first_name} {user?.last_name}</p>
                    <p className="text-xs text-gray-500">
                      {form.city} · {form.languages.slice(0, 3).join(', ')}
                      {form.years_experience ? ` · ${form.years_experience}+ yrs` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            {step > 1 ? (
              <button onClick={() => setStep((s) => s - 1)} className="btn-ghost px-6 py-3">
                ← Back
              </button>
            ) : (
              <div />
            )}

            {step < STEPS.length ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="btn-primary px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving || !canNext}
                className="btn-primary px-8 py-3 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Complete profile →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

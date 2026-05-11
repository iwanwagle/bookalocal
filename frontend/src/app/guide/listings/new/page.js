'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { listingsAPI, uploadsAPI } from '@/utils/api';
import { useIsAuthenticated, useUser } from '@/context/authStore';
import toast from 'react-hot-toast';

const CATEGORIES = ['hiking', 'city-tour', 'cultural', 'photography', 'adventure', 'food', 'wildlife', 'spiritual'];
const PRICING_TYPES = ['hourly', 'daily', 'package'];
const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict'];

const INCLUDES_SUGGESTIONS = ['Transportation', 'Meals', 'Equipment', 'Permits', 'Water', 'Snacks', 'Guide fees', 'Hotel pickup'];

export default function CreateListingPage() {
  const router = useRouter();
  const params = useParams();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const isEditing = !!params?.id;

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'hiking',
    location: 'Kathmandu, Nepal',
    price: '',
    pricing_type: 'daily',
    duration: '',
    max_persons: 10,
    min_persons: 1,
    languages: 'English, Nepali',
    cancellation_policy: 'flexible',
    includes: [],
    excludes: [],
    images: [],
    latitude: null,
    longitude: null,
  });
  const [geocoding, setGeocoding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [includeInput, setIncludeInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    if (user?.role !== 'guide') { router.push('/dashboard'); return; }
    if (isEditing) {
      listingsAPI.getById(params.id)
        .then(({ data }) => {
          // Backend returns listing fields spread at top level (plus reviews, is_wishlisted).
          const l = data;
          // Pre-fill the unified `price` UI field from whichever column is populated
          // for this listing's pricing_type (the form re-splits it on submit).
          const priceFromType = l.pricing_type === 'hourly' ? l.price_per_hour
            : l.pricing_type === 'package' ? l.package_price
            : l.price_per_day;
          const durationFromType = l.pricing_type === 'hourly' ? l.duration_hours
            : l.pricing_type === 'package' ? l.package_duration_days
            : '';
          setForm({
            title: l.title || '',
            description: l.description || '',
            category: l.category || 'hiking',
            location: l.location || '',
            latitude: l.latitude || null,
            longitude: l.longitude || null,
            price: priceFromType ?? '',
            pricing_type: l.pricing_type || 'daily',
            duration: durationFromType || '',
            max_persons: l.max_persons || 10,
            min_persons: l.min_persons || 1,
            languages: Array.isArray(l.languages) ? l.languages.join(', ') : l.languages || '',
            cancellation_policy: l.cancellation_policy || 'flexible',
            includes: l.includes || [],
            excludes: l.excludes || [],
            images: l.images || [],
          });
        })
        .catch(() => toast.error('Failed to load listing'));
    }
  }, [isAuth, user, isEditing]);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const { data } = await uploadsAPI.uploadImages(fd);
      // Backend returns { images: [{ url, public_id }, ...] } — extract url strings
      const newUrls = (data.images || []).map(img => img.url).filter(Boolean);
      setForm((prev) => ({ ...prev, images: [...prev.images, ...newUrls] }));
      toast.success(`${files.length} image(s) uploaded`);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const addItem = (type, value) => {
    if (!value.trim()) return;
    setForm((prev) => ({ ...prev, [type]: [...prev[type], value.trim()] }));
    if (type === 'includes') setIncludeInput('');
    else setExcludeInput('');
  };

  const removeItem = (type, idx) => {
    setForm((prev) => ({ ...prev, [type]: prev[type].filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.price || !form.description) {
      toast.error('Please fill all required fields');
      return;
    }
    setSaving(true);
    try {
      const priceNum = Number(form.price);
      const payload = {
        ...form,
        price_per_hour: form.pricing_type === 'hourly' ? priceNum : null,
        price_per_day: form.pricing_type === 'daily' ? priceNum : null,
        package_price: form.pricing_type === 'package' ? priceNum : null,
        duration_hours: form.pricing_type === 'hourly' ? (Number(form.duration) || null) : null,
        package_duration_days: form.pricing_type === 'package' ? (Number(form.duration) || null) : null,
        languages: form.languages.split(',').map((l) => l.trim()).filter(Boolean),
        city: form.location.split(',')[0]?.trim() || form.location,
        cover_image: form.images[0] || null,
      };
      delete payload.price;
      delete payload.duration;
      if (isEditing) {
        await listingsAPI.update(params.id, payload);
        toast.success('Listing updated! Pending admin review.');
      } else {
        await listingsAPI.create(payload);
        toast.success('Listing submitted for review!');
      }
      router.push('/guide/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save listing');
    } finally {
      setSaving(false);
    }
  };

  const f = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // X3: Geocode the location string to lat/lng using Mapbox Geocoding API.
  // Falls back to manual entry if the user prefers.
  const geocodeLocation = async () => {
    if (!form.location) { toast.error('Enter a location first'); return; }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { toast.error('Map service not configured'); return; }
    setGeocoding(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(form.location)}.json?country=NP&limit=1&access_token=${token}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features && data.features.length) {
        const [lng, lat] = data.features[0].center;
        setForm((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        toast.success('Location pinned to map');
      } else {
        toast.error('Could not find that location — try a more specific name');
      }
    } catch {
      toast.error('Geocoding failed. Please enter coordinates manually.');
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/guide/dashboard" className="text-brand-orange hover:underline text-sm">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">{isEditing ? 'Edit Listing' : 'Create New Listing'}</h1>
          <p className="text-gray-600">Your listing will be reviewed before going live.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => f('title', e.target.value)} className="input-field" placeholder="e.g. Everest Base Camp Trek — 14 Days" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea value={form.description} onChange={(e) => f('description', e.target.value)} rows={5} className="input-field resize-none" placeholder="Describe the experience in detail..." required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category} onChange={(e) => f('category', e.target.value)} className="input-field capitalize">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('-', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input value={form.location} onChange={(e) => f('location', e.target.value)} className="input-field" placeholder="e.g. Kathmandu, Nepal" required />
              </div>
            </div>

            {/* X3: Map coordinates — required for the listing to appear on the map view */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Map coordinates</label>
                <button
                  type="button"
                  onClick={geocodeLocation}
                  disabled={geocoding || !form.location}
                  className="text-xs px-3 py-1 rounded-lg bg-brand-orange/10 text-brand-orange font-medium hover:bg-brand-orange/20 disabled:opacity-50"
                >
                  {geocoding ? 'Finding…' : '📍 Find from location'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="any"
                  value={form.latitude ?? ''}
                  onChange={(e) => f('latitude', e.target.value === '' ? null : parseFloat(e.target.value))}
                  className="input-field"
                  placeholder="Latitude (e.g. 27.7172)"
                  aria-label="Latitude"
                />
                <input
                  type="number"
                  step="any"
                  value={form.longitude ?? ''}
                  onChange={(e) => f('longitude', e.target.value === '' ? null : parseFloat(e.target.value))}
                  className="input-field"
                  placeholder="Longitude (e.g. 85.3240)"
                  aria-label="Longitude"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Required to appear on the map view. Click "Find from location" or enter manually.</p>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Pricing & Duration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (NPR) *</label>
                <input type="number" min="0" value={form.price} onChange={(e) => f('price', e.target.value)} className="input-field" placeholder="5000" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pricing Type</label>
                <select value={form.pricing_type} onChange={(e) => f('pricing_type', e.target.value)} className="input-field capitalize">
                  {PRICING_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration ({form.pricing_type === 'hourly' ? 'hours' : 'days'})</label>
                <input type="number" min="1" value={form.duration} onChange={(e) => f('duration', e.target.value)} className="input-field" placeholder={form.pricing_type === 'hourly' ? '3' : '1'} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Persons</label>
                <input type="number" min="1" value={form.min_persons} onChange={(e) => f('min_persons', Number(e.target.value))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Persons</label>
                <input type="number" min="1" value={form.max_persons} onChange={(e) => f('max_persons', Number(e.target.value))} className="input-field" />
              </div>
            </div>
          </div>

          {/* Includes / Excludes */}
          <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">What's Included / Excluded</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Included ✅</label>
              <div className="flex gap-2 mb-2 flex-wrap">
                {INCLUDES_SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => { if (!form.includes.includes(s)) addItem('includes', s); }} className="text-xs px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200 hover:bg-green-100">
                    + {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={includeInput} onChange={(e) => setIncludeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem('includes', includeInput); }}} className="input-field flex-1" placeholder="Add item and press Enter" />
                <button type="button" onClick={() => addItem('includes', includeInput)} className="btn-primary px-4">Add</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {form.includes.map((item, i) => (
                  <span key={i} className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm">
                    {item}
                    <button type="button" onClick={() => removeItem('includes', i)} className="hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Excluded ❌</label>
              <div className="flex gap-2">
                <input value={excludeInput} onChange={(e) => setExcludeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem('excludes', excludeInput); }}} className="input-field flex-1" placeholder="e.g. International flights" />
                <button type="button" onClick={() => addItem('excludes', excludeInput)} className="btn-primary px-4">Add</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {form.excludes.map((item, i) => (
                  <span key={i} className="flex items-center gap-1 bg-red-50 text-red-600 px-3 py-1 rounded-full text-sm">
                    {item}
                    <button type="button" onClick={() => removeItem('excludes', i)} className="hover:text-red-800">×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Additional Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Languages (comma separated)</label>
                <input value={form.languages} onChange={(e) => f('languages', e.target.value)} className="input-field" placeholder="English, Nepali, Hindi" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation Policy</label>
                <select value={form.cancellation_policy} onChange={(e) => f('cancellation_policy', e.target.value)} className="input-field capitalize">
                  {CANCELLATION_POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Images */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Photos</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {form.images.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} className="w-full h-24 object-cover rounded-xl" alt={`Photo ${i + 1}`} />
                  <button type="button" onClick={() => f('images', form.images.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                </div>
              ))}
              <label className={`h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-brand-orange hover:bg-orange-50 transition-colors ${uploading ? 'opacity-50' : ''}`}>
                <span className="text-2xl mb-1">📷</span>
                <span className="text-xs text-gray-500">{uploading ? 'Uploading...' : 'Add photos'}</span>
                <input type="file" multiple accept="image/*" onChange={handleImageUpload} disabled={uploading} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-gray-500">Add up to 10 high-quality photos. First photo will be the cover.</p>
          </div>

          {/* Submit */}
          <div className="flex gap-4 pb-8">
            <Link href="/guide/dashboard" className="btn-ghost flex-1 py-3 text-center text-base">Cancel</Link>
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-3 text-base">
              {saving ? 'Saving...' : isEditing ? 'Update Listing' : 'Submit for Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

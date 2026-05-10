'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { guidesAPI, uploadsAPI } from '@/utils/api';
import { useIsAuthenticated, useUser } from '@/context/authStore';
import toast from 'react-hot-toast';

const ID_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National Identity Card' },
  { value: 'driving_license', label: "Driver's License" },
  { value: 'citizenship', label: 'Citizenship Certificate' },
];

export default function KYCPage() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  // We track public_id (which is what we send to the backend on submit) and the
  // signed_url (which we use to render a preview in the page). The signed_url is
  // disposable — we don't ship it anywhere.
  const [form, setForm] = useState({
    id_type: 'national_id',
    id_number: '',
    id_front_public_id: null,
    id_back_public_id: null,
  });
  const [previews, setPreviews] = useState({ front: null, back: null });
  const [uploading, setUploading] = useState({ front: false, back: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    if (user?.role !== 'guide') { router.push('/dashboard'); return; }
  }, [isAuth, user]);

  const uploadDoc = async (e, side) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPreviews((p) => ({ ...p, [side]: preview }));
    setUploading((u) => ({ ...u, [side]: true }));
    try {
      const fd = new FormData();
      fd.append('document', file);
      const { data } = await uploadsAPI.uploadKycDoc(fd);
      const fieldName = side === 'front' ? 'id_front_public_id' : 'id_back_public_id';
      setForm((f) => ({ ...f, [fieldName]: data.public_id }));
      // Replace the local object URL with the signed Cloudinary URL and free the object URL.
      setPreviews((p) => {
        if (p[side] && p[side].startsWith('blob:')) URL.revokeObjectURL(p[side]);
        return { ...p, [side]: data.signed_url };
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
      setPreviews((p) => ({ ...p, [side]: null }));
    } finally { setUploading((u) => ({ ...u, [side]: false })); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.id_number.trim()) { toast.error('Enter your ID number'); return; }
    if (!form.id_front_public_id) { toast.error('Upload the front of your ID'); return; }
    setSubmitting(true);
    try {
      await guidesAPI.submitKYC(form);
      setSubmitted(true);
      toast.success('Verification submitted! We\'ll review within 24 hours.');
    } catch (err) { toast.error(err.response?.data?.error || 'Submission failed'); }
    finally { setSubmitting(false); }
  };

  const f = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  if (submitted) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Documents submitted!</h2>
        <p className="text-gray-600 mb-6">Our team will review your ID within 24 hours. You'll receive an email once verified.</p>
        <Link href="/guide/dashboard" className="btn-primary px-8 py-3 inline-block">Back to dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <Link href="/guide/dashboard" className="text-brand-orange text-sm hover:underline block mb-6">← Back to dashboard</Link>

        <div className="bg-white rounded-2xl shadow-card p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Identity Verification</h1>
              <p className="text-sm text-gray-500">Get a verified badge on your profile</p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-4 mb-6 text-sm text-blue-700 border border-blue-100">
            <p className="font-semibold mb-1">Why verify your identity?</p>
            <ul className="space-y-1 text-blue-600 list-disc list-inside">
              <li>Earn a ✓ Verified badge on your profile</li>
              <li>Build trust with international travelers</li>
              <li>Get priority in search results</li>
              <li>Documents are reviewed by our team and never shared</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Type</label>
              <select value={form.id_type} onChange={(e) => f('id_type', e.target.value)} className="input-field">
                {ID_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
              <input
                type="text"
                value={form.id_number}
                onChange={(e) => f('id_number', e.target.value)}
                className="input-field"
                placeholder="Enter your document number"
                required
              />
            </div>

            {/* Front upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Front of document *</label>
              <label className={`block w-full border-2 border-dashed rounded-xl p-4 cursor-pointer text-center transition-colors ${previews.front ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-brand-orange hover:bg-orange-50'}`}>
                {uploading.front ? (
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <div className="w-4 h-4 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />
                    Uploading…
                  </div>
                ) : previews.front ? (
                  <div>
                    <img src={previews.front} alt="Front" className="h-28 mx-auto object-cover rounded-lg mb-1" />
                    <p className="text-xs text-green-600 font-medium">✓ Front uploaded — click to replace</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-3xl mb-1">📄</p>
                    <p className="text-sm text-gray-600">Click to upload front side</p>
                    <p className="text-xs text-gray-400">JPG, PNG or PDF, max 5MB</p>
                  </div>
                )}
                <input type="file" accept="image/*,.pdf" onChange={(e) => uploadDoc(e, 'front')} className="hidden" />
              </label>
            </div>

            {/* Back upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Back of document (optional)</label>
              <label className={`block w-full border-2 border-dashed rounded-xl p-4 cursor-pointer text-center transition-colors ${previews.back ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-gray-400'}`}>
                {uploading.back ? (
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Uploading…
                  </div>
                ) : previews.back ? (
                  <div>
                    <img src={previews.back} alt="Back" className="h-28 mx-auto object-cover rounded-lg mb-1" />
                    <p className="text-xs text-green-600 font-medium">✓ Back uploaded</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-3xl mb-1">📄</p>
                    <p className="text-sm text-gray-500">Click to upload back side</p>
                  </div>
                )}
                <input type="file" accept="image/*,.pdf" onChange={(e) => uploadDoc(e, 'back')} className="hidden" />
              </label>
            </div>

            <p className="text-xs text-gray-400">
              By submitting, you confirm this is a genuine document and agree to our verification terms. Your data is encrypted and only used for identity verification.
            </p>

            <button type="submit" disabled={submitting || !form.id_front_public_id || uploading.front || uploading.back} className="btn-primary w-full py-3 disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit for verification'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

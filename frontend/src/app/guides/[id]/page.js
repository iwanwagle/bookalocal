'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { guidesAPI, chatAPI } from '@/utils/api';
import { useIsAuthenticated, useUser } from '@/context/authStore';
import ListingCard from '@/components/common/ListingCard';
import toast from 'react-hot-toast';

export default function GuideProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    guidesAPI.getById(id)
      .then(({ data }) => setGuide(data.guide || data))
      .catch(() => toast.error('Guide not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const startChat = async () => {
    if (!isAuth) { router.push('/login'); return; }
    try {
      await chatAPI.createConversation({ guide_id: id, listing_id: guide?.listings?.[0]?.id });
      router.push('/messages');
    } catch (err) {
      if (err.response?.status === 409) router.push('/messages');
      else toast.error('Failed to start conversation');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full" />
    </div>
  );

  if (!guide) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-600">Guide not found. <Link href="/guides" className="text-brand-orange">Back to guides</Link></p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <Link href="/guides" className="text-brand-orange text-sm hover:underline block mb-6">← All Guides</Link>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-28 h-28 rounded-2xl bg-brand-orange overflow-hidden flex-shrink-0">
              {guide.avatar ? (
                <img src={guide.avatar} alt={guide.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-4xl font-bold">
                  {(guide.first_name?.[0] || guide.name?.[0])}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{guide.first_name} {guide.last_name}</h1>
                  <p className="text-gray-500 mt-1">📍 {guide.location || 'Nepal'}</p>
                  {guide.avg_rating > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex">
                        {[1,2,3,4,5].map((s) => (
                          <span key={s} className={`text-lg ${s <= Math.round(guide.average_rating) ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                        ))}
                      </div>
                      <span className="font-semibold">{Number(guide.avg_rating).toFixed(1)}</span>
                      <span className="text-gray-500">({guide.total_reviews || 0} reviews)</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  {isAuth && user?.role === 'traveler' && (
                    <button onClick={startChat} className="btn-secondary px-6 py-3 flex items-center gap-2">
                      💬 Message
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-4">
                {guide.years_experience > 0 && (
                  <div className="text-sm"><span className="font-semibold text-gray-900">{guide.years_experience}</span> <span className="text-gray-500">years exp.</span></div>
                )}
                {guide.total_reviews > 0 && (
                  <div className="text-sm"><span className="font-semibold text-gray-900">{guide.total_reviews}</span> <span className="text-gray-500">reviews</span></div>
                )}
                {guide.listings?.length > 0 && (
                  <div className="text-sm"><span className="font-semibold text-gray-900">{guide.listings.length}</span> <span className="text-gray-500">experiences</span></div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Bio */}
            {guide.bio && (
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">About</h2>
                <p className="text-gray-700 leading-relaxed">{guide.bio}</p>
              </div>
            )}

            {/* Listings */}
            {guide.listings?.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Experiences by {guide.name}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {guide.listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {guide.reviews?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Reviews ({guide.total_reviews || 0})</h2>
                <div className="space-y-4">
                  {guide.reviews.map((review) => (
                    <div key={review.id} className="pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-brand-orange flex items-center justify-center text-white text-sm font-bold">
                            {review.traveler_name?.[0] || 'T'}
                          </div>
                          <span className="font-semibold text-gray-900 text-sm">{review.traveler_name}</span>
                        </div>
                        <div className="flex">
                          {[1,2,3,4,5].map((s) => (
                            <span key={s} className={`text-sm ${s <= review.rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700">{review.comment}</p>
                      {review.guide_response && (
                        <div className="mt-2 pl-4 border-l-2 border-brand-orange bg-orange-50 rounded-r-xl p-3">
                          <p className="text-xs font-semibold text-brand-orange mb-1">Guide's response</p>
                          <p className="text-sm text-gray-700">{review.guide_response}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h3 className="font-bold text-gray-900 mb-3">Languages</h3>
              <div className="flex flex-wrap gap-2">
                {guide.languages?.map((lang) => (
                  <span key={lang} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">{lang}</span>
                ))}
              </div>
            </div>

            {guide.specialties?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-5">
                <h3 className="font-bold text-gray-900 mb-3">Specialties</h3>
                <div className="flex flex-wrap gap-2">
                  {guide.specialties.map((s) => (
                    <span key={s} className="px-3 py-1 bg-orange-50 text-brand-orange rounded-full text-sm capitalize">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {guide.certifications?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-5">
                <h3 className="font-bold text-gray-900 mb-3">Certifications</h3>
                <ul className="space-y-1">
                  {guide.certifications.map((cert, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="text-green-500">✓</span> {cert}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isAuth && user?.role === 'traveler' && (
              <button onClick={startChat} className="btn-primary w-full py-3">
                💬 Message {guide.first_name}
              </button>
            )}
            {!isAuth && (
              <Link href="/register" className="btn-primary w-full py-3 text-center block">
                Sign up to Contact
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { guidesAPI } from '@/utils/api';
import toast from 'react-hot-toast';

export default function GuidesPage() {
  const router = useRouter();
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ language: '', min_rating: '' });

  useEffect(() => {
    fetchGuides();
  }, [filters]);

  const fetchGuides = async () => {
    setLoading(true);
    try {
      const { data } = await guidesAPI.list(filters);
      setGuides(data.guides || data || []);
    } catch {
      toast.error('Failed to load guides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Nepal's Verified Local Guides</h1>
          <p className="text-gray-600">Experienced, trusted guides ready to show you Nepal</p>
          <div className="flex gap-4 mt-6 flex-wrap">
            <select value={filters.language} onChange={(e) => setFilters({ ...filters, language: e.target.value })} className="input-field w-auto">
              <option value="">All Languages</option>
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Chinese">Chinese</option>
              <option value="French">French</option>
            </select>
            <select value={filters.min_rating} onChange={(e) => setFilters({ ...filters, min_rating: e.target.value })} className="input-field w-auto">
              <option value="">Any Rating</option>
              <option value="4.5">4.5+ Stars</option>
              <option value="4.0">4.0+ Stars</option>
              <option value="3.5">3.5+ Stars</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => <div key={i} className="bg-white rounded-2xl h-64 animate-pulse" />)}
          </div>
        ) : guides.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🧑‍🏫</p>
            <p className="text-gray-600">No guides found. <Link href="/search" className="text-brand-orange">Browse listings instead</Link></p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((guide) => (
              <Link key={guide.id} href={`/guides/${guide.id}`} className="bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow group">
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-brand-orange overflow-hidden flex-shrink-0">
                      {guide.avatar ? (
                        <img src={guide.avatar} alt={guide.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                          {guide.name?.[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{guide.name}</h3>
                      <p className="text-sm text-gray-500">{guide.location || 'Nepal'}</p>
                      {guide.avg_rating > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-yellow-400 text-xs">★</span>
                          <span className="text-sm font-semibold text-gray-700">{Number(guide.avg_rating).toFixed(1)}</span>
                          <span className="text-xs text-gray-400">({guide.total_reviews || 0} reviews)</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {guide.bio && <p className="text-sm text-gray-600 line-clamp-2 mb-4">{guide.bio}</p>}
                  <div className="flex flex-wrap gap-2">
                    {guide.languages?.slice(0, 3).map((lang) => (
                      <span key={lang} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">{lang}</span>
                    ))}
                    {guide.specialties?.slice(0, 2).map((s) => (
                      <span key={s} className="text-xs px-2 py-1 bg-orange-50 text-brand-orange rounded-full capitalize">{s}</span>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm text-gray-500">{guide.years_experience || 0}+ years exp.</span>
                    <span className="text-sm text-brand-orange font-semibold group-hover:underline">View Profile →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

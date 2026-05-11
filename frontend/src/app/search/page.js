'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';
import ListingCard from '../../../components/common/ListingCard';
import { listingsAPI } from '../../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
const ListingsMap = dynamic(() => import('../../../components/common/ListingsMap'), { ssr: false });

const CATEGORIES = [
  { id: '', label: 'All' }, { id: 'hiking', label: '⛰️ Trekking' }, { id: 'cultural', label: '🏛️ Cultural' },
  { id: 'photography', label: '📸 Photography' }, { id: 'city_tour', label: '🏙️ City Tour' },
  { id: 'food_tour', label: '🍜 Food Tour' }, { id: 'adventure', label: '🧗 Adventure' },
  { id: 'spiritual', label: '🙏 Spiritual' }, { id: 'wildlife', label: '🦏 Wildlife' },
];

const SORT_OPTIONS = [
  { value: 'featured', label: 'Recommended' }, { value: 'rating', label: 'Highest Rated' },
  { value: 'price_asc', label: 'Price: Low to High' }, { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'popular', label: 'Most Popular' }, { value: 'newest', label: 'Newest' },
];

function FilterSidebar({ filters, onChange }) {
  return (
    <div className="space-y-6">
      {/* Price Range */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3">Price Range (NPR)</h4>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            placeholder="Min"
            value={filters.min_price || ''}
            onChange={e => onChange('min_price', e.target.value)}
            className="input-field"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.max_price || ''}
            onChange={e => onChange('max_price', e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {/* Min Rating */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3">Minimum Rating</h4>
        <div className="space-y-2">
          {[4.5, 4, 3, ''].map((r) => (
            <label key={r} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="min_rating"
                value={r}
                checked={filters.min_rating == r}
                onChange={() => onChange('min_rating', r)}
                className="accent-brand-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                {r ? `${r}★ & above` : 'Any rating'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Pricing Type */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3">Pricing Type</h4>
        <div className="space-y-2">
          {[{ v: '', l: 'All' }, { v: 'hourly', l: 'Hourly' }, { v: 'daily', l: 'Daily' }, { v: 'package', l: 'Package' }].map(({ v, l }) => (
            <label key={v} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="pricing_type"
                value={v}
                checked={filters.pricing_type == v}
                onChange={() => onChange('pricing_type', v)}
                className="accent-brand-500"
              />
              <span className="text-sm text-gray-700">{l}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      <button
        onClick={() => onChange('reset')}
        className="w-full btn-secondary text-sm"
      >
        Clear All Filters
      </button>
    </div>
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    city: searchParams.get('city') || '',
    category: searchParams.get('category') || '',
    min_price: '', max_price: '', min_rating: '', pricing_type: '',
    sort: 'featured', page: 1,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'map'

  // Debounce the text-input filters so we don't fire a new API call on every keystroke.
  // Dropdowns, ratings, and prices update instantly because they're discrete actions.
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilters(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  // Sync filters to URL (debounced via the same delay) so refresh/share preserves state.
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(debouncedFilters).forEach(([k, v]) => {
      if (v && v !== '' && !(k === 'sort' && v === 'featured') && !(k === 'page' && v === 1)) {
        params.set(k, v);
      }
    });
    const qs = params.toString();
    const newUrl = qs ? `/search?${qs}` : '/search';
    if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [debouncedFilters]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['listings', debouncedFilters],
    queryFn: () => listingsAPI.search(debouncedFilters).then(r => r.data),
    keepPreviousData: true,
  });

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'reset') {
      setFilters(f => ({ search: f.search, city: f.city, category: '', min_price: '', max_price: '', min_rating: '', pricing_type: '', sort: 'featured', page: 1 }));
    } else {
      setFilters(f => ({ ...f, [key]: value, page: 1 }));
    }
  }, []);

  const listings = data?.listings || [];
  const pagination = data?.pagination;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="pt-16">
        {/* Search Header */}
        <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            {/* Search Input Row */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={filters.search}
                  onChange={e => handleFilterChange('search', e.target.value)}
                  placeholder="Search experiences..."
                  className="input-field pl-10"
                />
              </div>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <input
                  type="text"
                  value={filters.city}
                  onChange={e => handleFilterChange('city', e.target.value)}
                  placeholder="City"
                  className="input-field pl-9 w-40"
                />
              </div>
              <select
                value={filters.sort}
                onChange={e => handleFilterChange('sort', e.target.value)}
                className="input-field w-48"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`btn-secondary flex items-center gap-2 ${showFilters ? 'border-brand-300 bg-brand-50 text-brand-600' : ''}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleFilterChange('category', cat.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    filters.category === cat.id
                      ? 'bg-brand-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-8">
            {/* Filter Sidebar */}
            <AnimatePresence>
              {showFilters && (
                <motion.aside
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 280 }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex-shrink-0 overflow-hidden"
                >
                  <div className="w-70 bg-white rounded-2xl shadow-card p-6">
                    <h3 className="font-display font-semibold text-gray-900 mb-6">Filters</h3>
                    <FilterSidebar filters={filters} onChange={handleFilterChange} />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>

            {/* Results */}
            <div className="flex-1 min-w-0">
              {/* View toggle + Results Count */}
              <div className="flex items-center justify-between mb-6">
                <p className="text-gray-600">
                  {isLoading ? 'Searching...' : (
                    pagination ? `${pagination.total} experience${pagination.total !== 1 ? 's' : ''} found` : '0 results'
                  )}
                  {filters.city && ` in ${filters.city}`}
                </p>
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'grid' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    ⊞ Grid
                  </button>
                  <button
                    onClick={() => setViewMode('map')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'map' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    🗺 Map
                  </button>
                </div>
              </div>

              {viewMode === 'map' ? (
                <div className="w-full rounded-2xl overflow-hidden" style={{ height: '65vh' }}>
                  <ListingsMap listings={listings} />
                </div>
              ) : isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(9)].map((_, i) => (
                    <div key={i} className="rounded-2xl overflow-hidden bg-white">
                      <div className="skeleton aspect-[4/3]" />
                      <div className="p-4 space-y-3">
                        <div className="skeleton h-4 w-3/4" />
                        <div className="skeleton h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="text-center py-20">
                  <p className="text-gray-500">Failed to load results. Please try again.</p>
                </div>
              ) : listings.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="font-display text-xl font-semibold text-gray-900 mb-2">No results found</h3>
                  <p className="text-gray-500 mb-6">Try adjusting your filters or searching a different location.</p>
                  <button onClick={() => handleFilterChange('reset')} className="btn-secondary">Clear filters</button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {listings.map((listing, i) => (
                      <ListingCard key={listing.id} listing={listing} index={i} />
                    ))}
                  </div>

                  {/* Pagination */}
                  {pagination && pagination.pages > 1 && (
                    <div className="flex justify-center gap-2 mt-10">
                      <button
                        onClick={() => handleFilterChange('page', filters.page - 1)}
                        disabled={filters.page <= 1}
                        className="btn-secondary disabled:opacity-40"
                      >
                        ← Previous
                      </button>
                      <span className="flex items-center px-4 text-sm text-gray-600">
                        Page {filters.page} of {pagination.pages}
                      </span>
                      <button
                        onClick={() => handleFilterChange('page', filters.page + 1)}
                        disabled={filters.page >= pagination.pages}
                        className="btn-secondary disabled:opacity-40"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

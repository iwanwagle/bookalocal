'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import ListingCard from '../../components/common/ListingCard';
import { listingsAPI } from '../../utils/api';

const CATEGORIES = [
  { id: 'hiking', label: 'Trekking', emoji: '⛰️', color: 'from-emerald-50 to-emerald-100 border-emerald-200' },
  { id: 'cultural', label: 'Cultural', emoji: '🏛️', color: 'from-purple-50 to-purple-100 border-purple-200' },
  { id: 'photography', label: 'Photography', emoji: '📸', color: 'from-pink-50 to-pink-100 border-pink-200' },
  { id: 'city_tour', label: 'City Tour', emoji: '🏙️', color: 'from-blue-50 to-blue-100 border-blue-200' },
  { id: 'food_tour', label: 'Food Tour', emoji: '🍜', color: 'from-amber-50 to-amber-100 border-amber-200' },
  { id: 'spiritual', label: 'Spiritual', emoji: '🙏', color: 'from-indigo-50 to-indigo-100 border-indigo-200' },
  { id: 'wildlife', label: 'Wildlife', emoji: '🦏', color: 'from-green-50 to-green-100 border-green-200' },
  { id: 'adventure', label: 'Adventure', emoji: '🧗', color: 'from-orange-50 to-orange-100 border-orange-200' },
];

const STATS = [
  { value: '500+', label: 'Verified Guides' },
  { value: '50+', label: 'Destinations' },
  { value: '10,000+', label: 'Happy Travelers' },
  { value: '4.9★', label: 'Average Rating' },
];

function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('Kathmandu');
  const [category, setCategory] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (city) params.set('city', city);
    if (category) params.set('category', category);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-modal p-2 flex flex-col md:flex-row gap-2">
      <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
        <svg className="w-5 h-5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-700 mb-0.5">Destination</div>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Kathmandu, Nepal"
            className="w-full text-sm outline-none text-gray-900 placeholder:text-gray-400 bg-transparent"
          />
        </div>
      </div>
      
      <div className="w-px bg-gray-200 hidden md:block" />
      
      <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
        <svg className="w-5 h-5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-700 mb-0.5">Activity</div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full text-sm outline-none text-gray-900 bg-transparent"
          >
            <option value="">All activities</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="w-px bg-gray-200 hidden md:block" />

      <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
        <svg className="w-5 h-5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-700 mb-0.5">Search</div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Everest Base Camp, photography..."
            className="w-full text-sm outline-none text-gray-900 placeholder:text-gray-400 bg-transparent"
          />
        </div>
      </div>

      <button type="submit" className="btn-primary px-8 rounded-xl">
        Search
      </button>
    </form>
  );
}

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [featuredListings, setFeaturedListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listingsAPI.featured().then(res => {
      setFeaturedListings(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar transparent />

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1920&q=90"
            alt="Nepal Himalayas"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-6">
              <span className="text-brand-300 text-sm">🇳🇵</span>
              <span className="text-white/90 text-sm font-medium">Launching in Nepal — Verified Local Guides</span>
            </div>

            {/* Heading */}
            <h1 className="font-display text-5xl md:text-7xl font-semibold text-white mb-6 leading-tight max-w-3xl">
              Experience Nepal{' '}
              <span className="text-brand-300 italic">through local eyes</span>
            </h1>
            <p className="text-white/80 text-xl mb-10 max-w-2xl leading-relaxed">
              {t('home.hero_subtitle', 'Book verified local guides for trekking, cultural experiences, photography tours, and more. Only pay 15% upfront — rest directly to your guide.')}
            </p>

            {/* Search Box */}
            <div className="max-w-3xl">
              <SearchBar />
            </div>

            {/* Popular searches */}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-white/60 text-sm mr-1">{t('home.popular_label', 'Popular:')}</span>
              {['Everest Base Camp', 'Annapurna Circuit', 'Kathmandu Tour', 'Sunrise Photography', 'Street Food Tour'].map(term => (
                <button
                  key={term}
                  onClick={() => router.push(`/search?search=${encodeURIComponent(term)}`)}
                  className="text-sm bg-white/10 hover:bg-white/20 text-white/90 px-3 py-1 rounded-full border border-white/20 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Stats bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/10">
              {STATS.map(({ value, label }) => (
                <div key={label} className="px-6 py-4 text-center">
                  <div className="font-display text-2xl font-semibold text-white">{value}</div>
                  <div className="text-white/60 text-sm">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="section-title text-center">What kind of experience?</h2>
          <p className="section-subtitle text-center">{t('home.featured_subtitle', "Explore Nepal's diverse offerings with expert local guides")}</p>
          
          <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
            {CATEGORIES.map((cat, i) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/search?category=${cat.id}`}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border bg-gradient-to-b ${cat.color} hover:shadow-md transition-all duration-200 hover:-translate-y-1 group`}
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">{cat.emoji}</span>
                  <span className="text-xs font-medium text-gray-700 text-center leading-tight">{cat.label}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="section-title mb-1">Top-rated experiences</h2>
              <p className="text-gray-500">Handpicked guides with exceptional reviews</p>
            </div>
            <Link href="/search" className="btn-ghost hidden md:block">
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden">
                  <div className="skeleton aspect-[4/3]" />
                  <div className="p-4 space-y-3">
                    <div className="skeleton h-4 w-3/4" />
                    <div className="skeleton h-3 w-1/2" />
                    <div className="skeleton h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredListings.map((listing, i) => (
                <ListingCard key={listing.id} listing={listing} index={i} />
              ))}
            </div>
          )}

          <div className="mt-8 text-center md:hidden">
            <Link href="/search" className="btn-secondary">View all experiences</Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="section-title text-center">How Bookalocal works</h2>
          <p className="section-subtitle text-center">Simple, transparent, and fair for everyone</p>

          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {[
              { step: '01', emoji: '🔍', title: 'Search & Discover', desc: 'Browse verified local guides filtered by location, activity, price, and rating. Read authentic reviews from other travelers.' },
              { step: '02', emoji: '💳', title: 'Book with 15% Deposit', desc: 'Secure your booking by paying just 15% online. The remaining 85% is paid directly to your guide on the day of the tour.' },
              { step: '03', emoji: '🏔️', title: 'Experience & Review', desc: 'Meet your guide and enjoy an authentic local experience. Share your review to help future travelers discover great guides.' },
            ].map(({ step, emoji, title, desc }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center"
              >
                <div className="relative inline-flex mb-6">
                  <div className="w-20 h-20 bg-white rounded-2xl shadow-card flex items-center justify-center text-4xl">
                    {emoji}
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {i + 1}
                  </div>
                </div>
                <h3 className="font-display text-xl font-semibold text-gray-900 mb-3">{title}</h3>
                <p className="text-gray-600 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Transparency Banner */}
      <section className="py-16 bg-brand-50 border-y border-brand-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center text-white text-2xl flex-shrink-0">
                💰
              </div>
              <div>
                <h3 className="font-display text-2xl font-semibold text-gray-900 mb-1">Fair & Transparent Pricing</h3>
                <p className="text-gray-600 max-w-lg">Pay only 15% online to secure your booking. The guide receives 85% directly from you on the day — no hidden fees, no surprises.</p>
              </div>
            </div>
            <Link href="/search" className="btn-primary whitespace-nowrap">Find a Guide →</Link>
          </div>
        </div>
      </section>

      {/* Become a Guide CTA */}
      <section className="py-24 relative overflow-hidden bg-gray-900">
        <div className="absolute inset-0 opacity-20">
          <img src="https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=1920" alt="" role="presentation" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-white mb-6">
              Share your knowledge.{' '}
              <span className="text-brand-300">Earn from your passion.</span>
            </h2>
            <p className="text-white/70 text-xl mb-10 max-w-2xl mx-auto">
              Join hundreds of local guides earning sustainable income by sharing the best of Nepal with travelers from around the world.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register?role=guide" className="btn-primary px-10 py-4 text-base">
                Become a Guide →
              </Link>
              <Link href="/about" className="border border-white/30 text-white hover:bg-white/10 font-medium px-10 py-4 rounded-xl transition-colors text-base">
                Learn More
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

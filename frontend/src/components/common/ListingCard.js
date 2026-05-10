'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { usersAPI } from '../../utils/api';
import { useCurrency } from '../../context/currencyContext';
import { useIsAuthenticated } from '../../context/authStore';
import toast from 'react-hot-toast';

const CATEGORY_LABELS = {
  city_tour: 'City Tour',
  hiking: 'Trekking / Hiking',
  cultural: 'Cultural',
  photography: 'Photography',
  food_tour: 'Food Tour',
  adventure: 'Adventure',
  wildlife: 'Wildlife',
  spiritual: 'Spiritual',
  other: 'Other',
};

const CATEGORY_COLORS = {
  hiking: 'bg-emerald-100 text-emerald-700',
  city_tour: 'bg-blue-100 text-blue-700',
  cultural: 'bg-purple-100 text-purple-700',
  photography: 'bg-pink-100 text-pink-700',
  food_tour: 'bg-amber-100 text-amber-700',
  adventure: 'bg-orange-100 text-orange-700',
  wildlife: 'bg-green-100 text-green-700',
  spiritual: 'bg-indigo-100 text-indigo-700',
};

function StarRating({ rating, count }) {
  return (
    <div className="flex items-center gap-1">
      <svg className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      <span className="text-sm font-medium text-gray-900">{parseFloat(rating).toFixed(1)}</span>
      {count !== undefined && <span className="text-sm text-gray-500">({count})</span>}
    </div>
  );
}

function PriceDisplay({ listing, formatPrice }) {
  if (listing.pricing_type === 'hourly') {
    return <><span className="font-semibold text-gray-900">{formatPrice(listing.price_per_hour)}</span><span className="text-gray-500 text-sm">/hr</span></>;
  }
  if (listing.pricing_type === 'daily') {
    return <><span className="font-semibold text-gray-900">{formatPrice(listing.price_per_day)}</span><span className="text-gray-500 text-sm">/day</span></>;
  }
  return (
    <div>
      <span className="font-semibold text-gray-900">{formatPrice(listing.package_price)}</span>
      <span className="text-gray-500 text-sm"> / {listing.package_duration_days}-day package</span>
    </div>
  );
}

export default function ListingCard({ listing, index = 0, wishlisted: initialWishlistedAlias, initialWishlisted: initialWishlistedDirect, onWishlistRemoved }) {
  const initialWishlisted = initialWishlistedDirect ?? initialWishlistedAlias ?? false;
  const { formatPrice } = useCurrency();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const isAuthenticated = useIsAuthenticated();

  const toggleWishlist = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) { toast.error('Please log in to save listings'); return; }
    setWishlistLoading(true);
    try {
      if (wishlisted) {
        await usersAPI.removeFromWishlist(listing.id);
        setWishlisted(false);
        toast.success('Removed from wishlist');
        if (onWishlistRemoved) onWishlistRemoved(listing.id);
      } else {
        await usersAPI.addWishlist(listing.id);
        setWishlisted(true);
        toast.success('Saved to wishlist');
      }
    } catch { toast.error('Failed to update wishlist'); }
    setWishlistLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Link href={`/listings/${listing.slug || listing.id}`} className="group block">
        <div className="card">
          {/* Image */}
          <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
            <img
              src={listing.cover_image || `https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80`}
              alt={listing.title ? `${listing.title} in ${listing.city || "Nepal"}` : "Listing photo"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            {/* Category badge */}
            <div className="absolute top-3 left-3">
              <span className={`badge text-xs ${CATEGORY_COLORS[listing.category] || 'bg-gray-100 text-gray-700'}`}>
                {CATEGORY_LABELS[listing.category]}
              </span>
            </div>
            {/* Featured badge */}
            {listing.is_featured && (
              <div className="absolute top-3 right-12">
                <span className="badge bg-brand-500 text-white text-xs">Featured</span>
              </div>
            )}
            {/* Wishlist button */}
            <button
              onClick={toggleWishlist}
              disabled={wishlistLoading}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
              aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
            >
              <svg className={`w-4 h-4 transition-colors ${wishlisted ? 'text-red-500 fill-red-500' : 'text-gray-400'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-medium text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-brand-600 transition-colors flex-1">
                {listing.title}
              </h3>
            </div>

            {/* Location */}
            <div className="flex items-center gap-1 text-gray-500 text-xs mb-3">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {listing.city}, {listing.country}
            </div>

            {/* Guide info */}
            <div className="flex items-center gap-2 mb-3">
              <img
                src={listing.avatar_url || `https://ui-avatars.com/api/?name=${listing.first_name}+${listing.last_name}&background=E85A1E&color=fff`}
                alt={listing.first_name}
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="text-xs text-gray-600">{listing.first_name} {listing.last_name}</span>
              {listing.years_experience && (
                <span className="text-xs text-gray-400">• {listing.years_experience}y exp</span>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
              <StarRating rating={listing.avg_rating || 0} count={listing.total_reviews} />
              <div className="text-right">
                <div className="text-xs text-gray-500">From</div>
                <PriceDisplay listing={listing} formatPrice={formatPrice} />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

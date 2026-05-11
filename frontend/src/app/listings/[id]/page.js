'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';
import { listingsAPI, bookingsAPI, reviewsAPI } from '../../../utils/api';
import AvailabilityCalendar from '../../../components/common/AvailabilityCalendar';
import { useAuthStore } from '../../../context/authStore';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useCurrency } from '../../../context/currencyContext';

function StarDisplay({ rating, size = 'md' }) {
  const s = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`${s} ${i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  const { formatPrice } = useCurrency();
  const [selectedDate, setSelectedDate] = useState(null);
  const [days, setDays] = useState(1);
  const [persons, setPersons] = useState(1);
  const [hours, setHours] = useState(2);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 0, title: '', comment: '' });
  const [hoverRating, setHoverRating] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => listingsAPI.getById(id).then(r => r.data),
  });

  // When the listing data first loads, snap persons up to the minimum required.
  // Must come AFTER the useQuery so `listing` is defined (avoids TDZ).
  useEffect(() => {
    if (listing?.min_persons && persons < listing.min_persons) {
      setPersons(listing.min_persons);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.min_persons]);

  const calcTotal = () => {
    if (!listing) return { total: 0, commission: 0, guide: 0 };
    let base = 0;
    if (listing.pricing_type === 'hourly') {
      base = listing.price_per_hour * hours * persons;
    } else if (listing.pricing_type === 'daily') {
      // B1: multiply by number of days for multi-day bookings
      base = listing.price_per_day * days * persons;
    } else {
      // Package pricing already includes duration in the price
      base = listing.package_price * persons;
    }
    const commission = parseFloat((base * 0.15).toFixed(2));
    return { total: base, commission, guide: base - commission };
  };

  const handleBooking = async () => {
    if (!isAuthenticated) { toast.error('Please log in to book'); router.push('/login'); return; }
    if (!selectedDate) { toast.error('Please select a date'); return; }

    setBookingLoading(true);
    try {
      const payload = {
        listing_id: listing.id,
        booking_date: selectedDate.toISOString().split('T')[0],
        num_persons: persons,
      };
      // B1: send the right duration field based on pricing type
      if (listing.pricing_type === 'hourly') payload.duration_hours = hours;
      else if (listing.pricing_type === 'daily') payload.duration_days = days;
      const { data: booking } = await bookingsAPI.create(payload);
      router.push(`/bookings/${booking.id}/checkout`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Booking failed');
    }
    setBookingLoading(false);
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!reviewForm.rating) { toast.error('Please select a star rating'); return; }
    if (!reviewForm.comment || reviewForm.comment.length < 10) { toast.error('Comment must be at least 10 characters'); return; }
    setSubmittingReview(true);
    try {
      // Find the completed booking for this listing
      const { data } = await bookingsAPI.list();
      const completedBooking = (data.bookings || []).find(
        (b) => b.listing_id === listing.id && b.status === 'completed'
      );
      if (!completedBooking) { toast.error('You need a completed booking to review'); setSubmittingReview(false); return; }
      await reviewsAPI.create({ booking_id: completedBooking.id, ...reviewForm });
      toast.success('Review submitted! Thank you.');
      setReviewSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const { total, commission, guide } = calcTotal();
  const allImages = listing ? [listing.cover_image, ...(listing.images || [])].filter(Boolean) : [];
  const reviews = showAllReviews ? listing?.reviews : listing?.reviews?.slice(0, 4);

  if (isLoading) return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="skeleton aspect-video rounded-2xl" />
            <div className="skeleton h-8 w-2/3 rounded-lg" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </div>
    </div>
  );

  if (!listing) return <div className="min-h-screen flex items-center justify-center"><p>Listing not found</p></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-16">
        {/* Image Gallery */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-2xl overflow-hidden mb-8" style={{ maxHeight: 500 }}>
            <div className="relative overflow-hidden">
              <img
                src={allImages[activeImage] || listing.cover_image}
                alt={listing.title || "Listing photo"}
                className="w-full h-full object-cover"
              />
            </div>
            {allImages.length > 1 && (
              <div className="grid grid-cols-2 gap-3">
                {allImages.slice(1, 5).map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImage(i + 1)}
                    className="relative overflow-hidden cursor-pointer block w-full h-full"
                    aria-label={`View image ${i + 2} of ${listing.images.length + 1}`}
                  >
                    <img src={img} alt={`${listing.title} — view ${i + 2}`} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="badge bg-brand-50 text-brand-600">{listing.category?.replace('_', ' ')}</span>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-600 text-sm">{listing.city}, {listing.country}</span>
                </div>
                <h1 className="font-display text-3xl md:text-4xl font-semibold text-gray-900 mb-4">{listing.title}</h1>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <StarDisplay rating={listing.avg_rating} />
                    <span className="font-medium">{parseFloat(listing.avg_rating).toFixed(1)}</span>
                    <span className="text-gray-500">({listing.total_reviews} reviews)</span>
                  </div>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-600">{listing.total_bookings} bookings</span>
                  {listing.is_featured && <span className="badge bg-brand-50 text-brand-600">⭐ Featured</span>}
                </div>
              </div>

              {/* Guide Info */}
              <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-2xl">
                <img
                  src={listing.avatar_url}
                  alt={listing.first_name}
                  className="w-14 h-14 rounded-xl object-cover"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-lg">
                    {listing.first_name} {listing.last_name}
                  </div>
                  <div className="text-gray-500 text-sm">
                    {listing.years_experience}+ years experience • {listing.languages?.join(', ')}
                  </div>
                </div>
                <Link href={`/guides/${listing.guide_id}`} className="btn-secondary text-sm">
                  View Profile
                </Link>
              </div>

              {/* Description */}
              <div>
                <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">About this experience</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">{listing.description}</p>
              </div>

              {/* What's included */}
              {listing.includes?.length > 0 && (
                <div>
                  <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">What's included</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {listing.includes.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                        <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What's not included */}
              {listing.excludes?.length > 0 && (
                <div>
                  <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">Not included</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {listing.excludes.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-gray-500">
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cancellation */}
              <div className="p-5 bg-gray-50 rounded-2xl">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div>
                    <div className="font-medium text-gray-900 mb-1">Cancellation Policy</div>
                    <p className="text-gray-600 text-sm">{listing.cancellation_policy}</p>
                  </div>
                </div>
              </div>

              {/* Reviews */}
              {listing.reviews?.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="font-display text-xl font-semibold text-gray-900">Reviews</h2>
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full">
                      <StarDisplay rating={listing.avg_rating} size="sm" />
                      <span className="font-semibold text-sm">{parseFloat(listing.avg_rating).toFixed(1)}</span>
                      <span className="text-gray-500 text-sm">({listing.total_reviews})</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="p-5 bg-gray-50 rounded-2xl">
                        <div className="flex items-center gap-3 mb-3">
                          <img src={review.avatar_url} alt={review.first_name || 'Reviewer'} className="w-9 h-9 rounded-full" />
                          <div>
                            <div className="font-medium text-sm text-gray-900">{review.first_name} {review.last_name}</div>
                            <div className="text-xs text-gray-500">{new Date(review.created_at).toLocaleDateString()}</div>
                          </div>
                          <div className="ml-auto">
                            <StarDisplay rating={review.rating} size="sm" />
                          </div>
                        </div>
                        {review.title && <div className="font-medium text-sm text-gray-900 mb-1">{review.title}</div>}
                        <p className="text-gray-700 text-sm leading-relaxed">{review.comment}</p>
                        {review.guide_response && (
                          <div className="mt-3 pl-3 border-l-2 border-brand-200">
                            <p className="text-xs font-medium text-brand-600 mb-1">Guide response:</p>
                            <p className="text-sm text-gray-600">{review.guide_response}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {listing.reviews.length > 4 && (
                    <button onClick={() => setShowAllReviews(!showAllReviews)} className="mt-4 btn-secondary">
                      {showAllReviews ? 'Show fewer reviews' : `Show all ${listing.reviews.length} reviews`}
                    </button>
                  )}
                </div>
              )}

              {/* Write a Review — shown to authenticated travelers with completed bookings */}
              {isAuthenticated && user?.role === 'traveler' && (
                <div id="review" className="bg-white rounded-2xl shadow-card p-6 scroll-mt-24">
                  <h2 className="font-display text-xl font-semibold text-gray-900 mb-1">Leave a review</h2>
                  <p className="text-sm text-gray-500 mb-5">Only travelers who completed this experience can review.</p>

                  {reviewSubmitted ? (
                    <div className="text-center py-6">
                      <div className="text-4xl mb-3">🎉</div>
                      <p className="font-semibold text-gray-900">Thank you for your review!</p>
                      <p className="text-sm text-gray-500 mt-1">It helps future travelers find great experiences.</p>
                    </div>
                  ) : (
                    <form onSubmit={submitReview} className="space-y-4">
                      {/* Star selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Your rating</label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewForm((f) => ({ ...f, rating: star }))}
                              onMouseEnter={() => setHoverRating(star)}
                              onMouseLeave={() => setHoverRating(0)}
                              className="text-3xl transition-transform hover:scale-110"
                              aria-label={`Rate ${star} stars`}
                            >
                              <span className={(hoverRating || reviewForm.rating) >= star ? 'text-amber-400' : 'text-gray-200'}>
                                ★
                              </span>
                            </button>
                          ))}
                          {reviewForm.rating > 0 && (
                            <span className="ml-2 self-center text-sm text-gray-500">
                              {['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][reviewForm.rating]}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
                        <input
                          type="text"
                          value={reviewForm.title}
                          onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))}
                          className="input-field"
                          placeholder="Sum it up in a few words"
                          maxLength={100}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Your review <span className="text-gray-400 font-normal">({reviewForm.comment.length}/500)</span>
                        </label>
                        <textarea
                          value={reviewForm.comment}
                          onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value.slice(0, 500) }))}
                          rows={4}
                          className="input-field resize-none"
                          placeholder="Tell other travelers what made this experience special…"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingReview || !reviewForm.rating}
                        className="btn-primary px-8 py-3 disabled:opacity-50"
                      >
                        {submittingReview ? 'Submitting…' : 'Submit review'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Booking Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <div className="bg-white rounded-2xl shadow-modal border border-gray-100 p-6">
                  {/* Price */}
                  <div className="mb-6">
                    {listing.pricing_type === 'package' ? (
                      <div>
                        <span className="font-display text-3xl font-semibold text-gray-900">{formatPrice(listing.package_price)}</span>
                        <span className="text-gray-500"> / {listing.package_duration_days}-day package</span>
                      </div>
                    ) : listing.pricing_type === 'daily' ? (
                      <div>
                        <span className="font-display text-3xl font-semibold text-gray-900">{formatPrice(listing.price_per_day)}</span>
                        <span className="text-gray-500">/day per person</span>
                      </div>
                    ) : (
                      <div>
                        <span className="font-display text-3xl font-semibold text-gray-900">{formatPrice(listing.price_per_hour)}</span>
                        <span className="text-gray-500">/hour per person</span>
                      </div>
                    )}
                  </div>

                  {/* Date */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                    <DatePicker
                      selected={selectedDate}
                      onChange={setSelectedDate}
                      minDate={new Date()}
                      placeholderText="Select date"
                      className="input-field"
                      dateFormat="MMMM d, yyyy"
                    />
                  </div>

                  {/* Persons */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Persons ({listing.min_persons}–{listing.max_persons})
                    </label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setPersons(Math.max(listing.min_persons, persons - 1))}
                        className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-lg">-</button>
                      <span className="text-lg font-medium w-8 text-center">{persons}</span>
                      <button onClick={() => setPersons(Math.min(listing.max_persons, persons + 1))}
                        className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-lg">+</button>
                    </div>
                  </div>

                  {/* Hours (for hourly) */}
                  {listing.pricing_type === 'hourly' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Duration (hours)</label>
                      <select value={hours} onChange={e => setHours(parseInt(e.target.value))} className="input-field" aria-label="Number of hours">
                        {[2,3,4,5,6,8].map(h => <option key={h} value={h}>{h} hours</option>)}
                      </select>
                    </div>
                  )}

                  {/* Days (for daily — B1 fix) */}
                  {listing.pricing_type === 'daily' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Duration (days)</label>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDays(Math.max(1, days - 1))}
                          aria-label="Decrease days"
                          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-lg"
                        >−</button>
                        <span className="text-lg font-medium w-16 text-center">{days} day{days > 1 ? 's' : ''}</span>
                        <button
                          type="button"
                          onClick={() => setDays(Math.min(60, days + 1))}
                          aria-label="Increase days"
                          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-lg"
                        >+</button>
                      </div>
                    </div>
                  )}

                  {/* Price Breakdown */}
                  <div className="py-4 border-t border-gray-100 space-y-2 mb-4">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Total experience cost</span>
                      <span>{formatPrice(total)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-brand-600">Pay now (15% deposit)</span>
                      <span className="font-medium text-brand-600">{formatPrice(commission)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Pay guide directly</span>
                      <span>{formatPrice(guide)}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleBooking}
                    disabled={bookingLoading || !selectedDate}
                    className="btn-primary w-full py-4 text-base"
                  >
                    {bookingLoading ? 'Creating booking...' : `Reserve — Pay ${formatPrice(commission)} now`}
                  </button>

                  <p className="text-xs text-gray-500 text-center mt-3">
                    You won't be charged for the full amount. Only the 15% platform fee is charged online.
                  </p>
                </div>

                {/* Contact Guide */}
                <Link
                  href={`/messages?guide=${listing.guide_user_id}&listing=${listing.id}`}
                  className="mt-4 btn-secondary w-full text-center flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Message Guide
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

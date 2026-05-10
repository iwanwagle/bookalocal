'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { bookingsAPI, paymentsAPI } from '@/utils/api';
import { useIsAuthenticated } from '@/context/authStore';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY || 'pk_test_placeholder');

function CheckoutForm({ booking, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    try {
      // Create payment intent
      const { data } = await paymentsAPI.createIntent(booking.id);
      const { clientSecret } = data;

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: { name: booking.traveler_name || 'Traveler' },
        },
      });

      if (result.error) {
        setError(result.error.message);
      } else if (result.paymentIntent.status === 'succeeded') {
        toast.success('Payment successful! Booking confirmed.');
        onSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border-2 border-gray-200 rounded-xl focus-within:border-brand-orange transition-colors">
        <CardElement
          options={{
            style: {
              base: { fontSize: '16px', color: '#1a1a2e', fontFamily: 'DM Sans, sans-serif' },
              invalid: { color: '#e74c3c' },
            },
          }}
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="btn-primary w-full py-4 text-lg"
      >
        {loading ? 'Processing...' : `Pay NPR ${booking.platform_fee?.toLocaleString()} Now`}
      </button>
      <p className="text-center text-xs text-gray-500">
        🔒 Secured by Stripe. Your card details are encrypted.
      </p>
    </form>
  );
}

export default function CheckoutPage() {
  const { id } = useParams();
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    bookingsAPI.getById(id)
      .then(({ data }) => setBooking(data.booking))
      .catch(() => toast.error('Booking not found'))
      .finally(() => setLoading(false));
  }, [id, isAuth]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full" />
    </div>
  );

  if (!booking) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-600">Booking not found. <Link href="/" className="text-brand-orange">Go home</Link></p>
    </div>
  );

  if (booking.payment_status === 'paid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Already Paid!</h2>
          <p className="text-gray-600 mb-6">This booking has already been paid. Check your dashboard for details.</p>
          <Link href="/dashboard" className="btn-primary inline-block px-8 py-3">View Dashboard</Link>
        </div>
      </div>
    );
  }

  const totalAmount = booking.total_amount || 0;
  const platformFee = booking.platform_commission || Math.round(totalAmount * 0.15);
  const guideFee = totalAmount - platformFee;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href={`/listings/${booking.listing_id}`} className="text-brand-orange hover:underline flex items-center gap-1 text-sm mb-4">
            ← Back to listing
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Complete Your Booking</h1>
          <p className="text-gray-600 mt-1">Secure your spot with a small upfront payment</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Booking Summary */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Booking Summary</h2>
              <div className="flex gap-4 mb-4 pb-4 border-b border-gray-100">
                {booking.cover_image && (
                  <img src={booking.cover_image} alt={booking.listing_title} className="w-20 h-20 rounded-xl object-cover" />
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">{booking.listing_title}</h3>
                  <p className="text-sm text-gray-600">with {booking.guide_first} {booking.guide_last}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Date</span>
                  <span className="font-medium">{booking.booking_date ? format(new Date(booking.booking_date), 'MMM d, yyyy') : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Start time</span>
                  <span className="font-medium">{booking.start_time || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration</span>
                  <span className="font-medium">{booking.duration_hours || booking.duration_days || '—'} {booking.pricing_type === 'hourly' ? 'hrs' : 'days'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Persons</span>
                  <span className="font-medium">{booking.num_persons}</span>
                </div>
              </div>
            </div>

            {/* Payment Breakdown */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Breakdown</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total experience price</span>
                  <span className="font-medium">NPR {totalAmount.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-gray-900">Pay online now (15%)</span>
                      <p className="text-xs text-gray-500">Platform booking fee</p>
                    </div>
                    <span className="text-xl font-bold text-brand-orange">NPR {platformFee.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center bg-amber-50 rounded-xl p-3">
                  <div>
                    <span className="font-semibold text-amber-800">Pay guide directly (85%)</span>
                    <p className="text-xs text-amber-600">Cash or transfer on the day</p>
                  </div>
                  <span className="font-bold text-amber-700">NPR {guideFee.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <h3 className="font-semibold text-blue-800 mb-1">📋 Cancellation Policy</h3>
              <p className="text-sm text-blue-700">
                {booking.cancellation_policy === 'flexible'
                  ? 'Free cancellation up to 24 hours before.'
                  : booking.cancellation_policy === 'moderate'
                  ? 'Free cancellation up to 5 days before.'
                  : 'Non-refundable.'}
              </p>
            </div>
          </div>

          {/* Payment Form */}
          <div className="bg-white rounded-2xl shadow-card p-6 h-fit">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Pay NPR {platformFee.toLocaleString()}</h2>
            <p className="text-sm text-gray-500 mb-6">15% platform fee to confirm your booking</p>
            <Elements stripe={stripePromise}>
              <CheckoutForm booking={{ ...booking, platform_fee: platformFee }} onSuccess={() => router.push(`/bookings/${id}/confirmation`)} />
            </Elements>
          </div>
        </div>
      </div>
    </div>
  );
}

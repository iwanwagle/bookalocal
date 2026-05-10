'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { bookingsAPI } from '@/utils/api';
import { useIsAuthenticated } from '@/context/authStore';
import { format } from 'date-fns';

export default function BookingConfirmationPage() {
  const { id } = useParams();
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    bookingsAPI.getById(id)
      .then(({ data }) => setBooking(data.booking || data))
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false));
  }, [id, isAuth]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full" />
    </div>
  );

  if (!booking) return null;

  const isPaid = booking.payment_status === 'paid';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        {/* Success icon */}
        <div className="text-center mb-8">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${isPaid ? 'bg-green-100' : 'bg-yellow-100'}`}>
            {isPaid ? (
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isPaid ? 'Booking confirmed!' : 'Booking received'}
          </h1>
          <p className="text-gray-500">
            {isPaid
              ? 'Your payment was successful and your spot is secured.'
              : 'Complete payment to secure your booking.'}
          </p>
        </div>

        {/* Booking details card */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-6">
          {/* Reference bar */}
          <div className="bg-brand-orange px-6 py-4 flex items-center justify-between">
            <span className="text-orange-100 text-sm">Booking reference</span>
            <span className="text-white font-bold text-lg tracking-wide">{booking.booking_ref}</span>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            <div className="flex gap-4">
              {booking.cover_image && (
                <img src={booking.cover_image} alt={booking.listing_title} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
              )}
              <div>
                <h2 className="font-bold text-gray-900 text-lg leading-tight">{booking.listing_title}</h2>
                <p className="text-gray-500 text-sm mt-1">with {booking.guide_first} {booking.guide_last}</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2.5">
              {[
                { label: 'Date', value: booking.booking_date ? format(new Date(booking.booking_date), 'EEEE, MMMM d yyyy') : '—' },
                { label: 'Persons', value: `${booking.num_persons} person${booking.num_persons > 1 ? 's' : ''}` },
                { label: 'Start time', value: booking.start_time || 'As agreed with guide' },
                { label: 'Meeting point', value: booking.meeting_point || 'Coordinate with guide' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900 text-right max-w-[60%]">{value}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total experience</span>
                <span className="font-medium">NPR {booking.total_amount?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-600 font-medium">✓ Paid online (15%)</span>
                <span className="font-bold text-green-600">NPR {booking.platform_commission?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm bg-amber-50 rounded-xl px-3 py-2.5 mt-1">
                <span className="text-amber-700 font-medium">💵 Pay guide on the day (85%)</span>
                <span className="font-bold text-amber-700">NPR {booking.guide_amount?.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-3">What happens next?</h3>
          <div className="space-y-3">
            {[
              { icon: '📧', text: "Check your email — we've sent a booking confirmation." },
              { icon: '⏳', text: 'Your guide will accept or decline within 24 hours.' },
              { icon: '💵', text: `Bring NPR ${booking.guide_amount?.toLocaleString()} cash to pay the guide on the day.` },
              { icon: '⭐', text: 'After the experience, leave a review to help other travelers.' },
            ].map(({ icon, text }, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-lg flex-shrink-0">{icon}</span>
                <span className="text-gray-600 leading-snug">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Receipt download — only useful when payment succeeded */}
        {isPaid && (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/bookings/${booking.id}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              // Append the auth token via Authorization header — but anchor tags can't do that.
              // Browsers send cookies if any; our API uses Bearer tokens. Use a helper instead.
              e.preventDefault();
              const token = typeof window !== 'undefined' ? localStorage.getItem('bl_token') : null;
              if (!token) return;
              fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/bookings/${booking.id}/receipt`, {
                headers: { Authorization: `Bearer ${token}` }
              })
                .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `bookalocal-receipt-${booking.booking_ref}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 0);
                })
                .catch(() => alert('Could not download receipt. Please try again.'));
            }}
            className="block w-full bg-white border border-gray-200 rounded-2xl py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 mb-3"
          >
            📄 Download PDF receipt
          </a>
        )}

        {/* CTA buttons */}
        <div className="flex gap-3">
          <Link href="/dashboard" className="btn-primary flex-1 py-3 text-center">
            View my bookings
          </Link>
          <Link href="/search" className="btn-ghost flex-1 py-3 text-center">
            Explore more
          </Link>
        </div>
      </div>
    </div>
  );
}

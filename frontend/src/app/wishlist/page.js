'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usersAPI } from '@/utils/api';
import { useIsAuthenticated } from '@/context/authStore';
import ListingCard from '@/components/common/ListingCard';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import toast from 'react-hot-toast';

export default function WishlistPage() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    let cancelled = false;
    usersAPI.getWishlist()
      .then(({ data }) => { if (!cancelled) setItems(data.wishlist || []); })
      .catch(() => { if (!cancelled) toast.error('Failed to load wishlist'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuth, router]);

  const handleRemoved = (id) => {
    // ListingCard's heart toggle calls the API itself; we just update local state
    setItems((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-1">Wishlist</h1>
            <p className="text-gray-500">{items.length} saved {items.length === 1 ? 'experience' : 'experiences'}</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-card">
                  <div className="skeleton aspect-[4/3]" />
                  <div className="p-4 space-y-2">
                    <div className="skeleton h-4 w-3/4" />
                    <div className="skeleton h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card p-12 text-center max-w-lg mx-auto">
              <div className="text-5xl mb-4">💭</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Nothing saved yet</h2>
              <p className="text-gray-500 mb-6">
                Tap the heart on any listing to save it for later. Your wishlist is private — only you can see it.
              </p>
              <Link href="/search" className="btn-primary px-6 py-2.5 inline-block">
                Browse experiences →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {items.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  initialWishlisted={true}
                  onWishlistRemoved={() => handleRemoved(listing.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

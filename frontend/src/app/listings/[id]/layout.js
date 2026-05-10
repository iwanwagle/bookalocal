import { listingsAPI } from '../../../utils/api_server';

export async function generateMetadata({ params }) {
  try {
    const { data: listing } = await listingsAPI.getById(params.id);
    if (!listing) return { title: 'Listing | Bookalocal' };
    const price = listing.price_per_day || listing.price_per_hour || listing.package_price;
    return {
      title: listing.title,
      description: (listing.description || '').slice(0, 155),
      openGraph: {
        title: listing.title,
        description: `Book ${listing.first_name} in ${listing.city}. From NPR ${price?.toLocaleString()}.`,
        images: listing.cover_image ? [{ url: listing.cover_image, width: 1200, height: 630 }] : [],
      },
      twitter: { card: 'summary_large_image', title: listing.title },
    };
  } catch {
    return { title: 'Experience | Bookalocal' };
  }
}

export default function ListingLayout({ children }) { return children; }

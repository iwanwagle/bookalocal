import { guidesAPI } from '../../../utils/api_server';

export async function generateMetadata({ params }) {
  try {
    const { data } = await guidesAPI.getById(params.id);
    const guide = data?.guide || data;
    if (!guide) return { title: 'Guide | Bookalocal' };
    return {
      title: `${guide.first_name} ${guide.last_name} — Guide in ${guide.city || 'Nepal'}`,
      description: (guide.bio || '').slice(0, 155),
      openGraph: {
        title: `${guide.first_name} ${guide.last_name}`,
        description: `${guide.city}, Nepal · ⭐ ${Number(guide.avg_rating || 0).toFixed(1)}`,
        images: guide.avatar_url ? [{ url: guide.avatar_url }] : [],
      },
    };
  } catch {
    return { title: 'Guide | Bookalocal' };
  }
}

export default function GuideLayout({ children }) { return children; }

// Server-side API helper — runs during generateMetadata (SSR)
// Uses the backend URL directly from env vars
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const serverFetch = async (path) => {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { data: await res.json() };
};

export const listingsAPI = {
  getById: (id) => serverFetch(`/listings/${id}`),
};

export const guidesAPI = {
  getById: (id) => serverFetch(`/guides/${id}`),
};

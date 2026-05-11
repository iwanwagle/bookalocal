'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Lazy-load mapbox-gl only on client to avoid SSR issues
let mapboxgl = null;

export default function ListingsMap({ listings = [] }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const popupRef = useRef(null);
  const [selectedListing, setSelectedListing] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!token || !mapContainer.current) return;

    const init = async () => {
      try {
        mapboxgl = (await import('mapbox-gl')).default;
        await import('mapbox-gl/dist/mapbox-gl.css');
        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/light-v11',
          center: [84.124, 28.394], // Nepal center
          zoom: 6.5,
          attributionControl: false,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

        map.on('load', () => {
          mapRef.current = map;
          setMapLoaded(true);
        });
      } catch (e) {
        console.error('Map init failed:', e);
        setError(true);
      }
    };
    init();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token]);

  // Update markers when listings or map change
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }

    const validListings = listings.filter((l) => l.latitude && l.longitude);
    if (!validListings.length) return;

    // Fit map to markers
    if (validListings.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      validListings.forEach((l) => bounds.extend([l.longitude, l.latitude]));
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 800 });
    }

    validListings.forEach((listing) => {
      const price = listing.price_per_day || listing.price_per_hour || listing.package_price || 0;

      // Custom marker element
      const el = document.createElement('div');
      el.className = 'mapbox-price-marker';
      el.style.cssText = `
        background: #E85A1E; color: white; font-size: 12px; font-weight: 600;
        padding: 4px 8px; border-radius: 20px; cursor: pointer; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(232,90,30,0.4); border: 2px solid white;
        transition: transform 0.15s, background 0.15s;
      `;
      el.textContent = `NPR ${price.toLocaleString()}`;
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.1)'; el.style.background = '#c44d16'; });
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; el.style.background = '#E85A1E'; });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([listing.longitude, listing.latitude])
        .addTo(mapRef.current);

      el.addEventListener('click', () => {
        setSelectedListing(listing);

        if (popupRef.current) popupRef.current.remove();
        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false, maxWidth: '240px' })
          .setLngLat([listing.longitude, listing.latitude])
          .setHTML(`
            <div style="font-family:sans-serif;padding:2px;">
              <img src="${listing.cover_image || ''}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />
              <p style="font-size:13px;font-weight:600;margin:0 0 4px;color:#111;">${listing.title}</p>
              <p style="font-size:12px;color:#666;margin:0 0 6px;">${listing.city || ''}</p>
              <p style="font-size:13px;font-weight:700;color:#E85A1E;margin:0;">NPR ${price.toLocaleString()} / ${listing.pricing_type}</p>
            </div>
          `)
          .addTo(mapRef.current);
        popupRef.current = popup;

        mapRef.current.flyTo({ center: [listing.longitude, listing.latitude], zoom: 12, duration: 600 });
      });

      markersRef.current.push(marker);
    });
  }, [mapLoaded, listings]);

  // In dev with no token, show a helpful message that points the developer at the
  // env var. In production, surface a clean empty state to end users.
  const isDev = process.env.NODE_ENV !== 'production';

  if (!token) {
    return (
      <div className="w-full h-full bg-gray-50 rounded-2xl flex items-center justify-center text-center p-6 border border-dashed border-gray-200">
        <div>
          <p className="text-4xl mb-3" aria-hidden="true">🗺️</p>
          <p className="font-semibold text-gray-700">Map view unavailable</p>
          {isDev ? (
            <p className="text-sm text-gray-500 mt-1">
              Set <code className="bg-gray-200 px-1.5 rounded text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code className="bg-gray-200 px-1.5 rounded text-xs">.env.local</code> to enable
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">Switch to grid view to browse listings</p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-gray-50 rounded-2xl flex items-center justify-center text-center p-6 border border-dashed border-gray-200">
        <div>
          <p className="text-3xl mb-2" aria-hidden="true">⚠️</p>
          <p className="font-semibold text-gray-700">Couldn't load map</p>
          <p className="text-sm text-gray-500 mt-1">Try refreshing, or switch to grid view</p>
        </div>
      </div>
    );
  }

  // No coordinate data among the listings — show a focused empty state instead
  // of an empty Nepal map, which looks broken.
  const hasGeocodedListings = listings.some((l) => l.latitude && l.longitude);
  if (mapLoaded && !hasGeocodedListings) {
    return (
      <div className="relative w-full h-full">
        <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden opacity-30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 text-center">
            <p className="font-semibold text-gray-800">No mapped listings</p>
            <p className="text-sm text-gray-500 mt-1">No experiences in this area have coordinates yet</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <div ref={mapContainer} className="w-full h-full" />

      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full" />
        </div>
      )}

      {/* Listing count badge */}
      {mapLoaded && (
        <div className="absolute top-3 left-3 bg-white rounded-full px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm border border-gray-100">
          {listings.filter((l) => l.latitude && l.longitude).length} locations
        </div>
      )}

      {/* Selected listing card */}
      {selectedListing && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-72 bg-white rounded-2xl shadow-lg p-4 border border-gray-100">
          <button
            onClick={() => { setSelectedListing(null); if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; } }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center text-sm"
          >
            ×
          </button>
          <div className="flex gap-3">
            {selectedListing.cover_image && (
              <img src={selectedListing.cover_image} alt={selectedListing.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 line-clamp-2 mb-0.5">{selectedListing.title}</p>
              <p className="text-xs text-gray-500 mb-2">{selectedListing.city}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-brand-orange">
                  NPR {(selectedListing.price_per_day || selectedListing.price_per_hour || selectedListing.package_price || 0).toLocaleString()}
                </span>
                <Link
                  href={`/listings/${selectedListing.slug || selectedListing.id}`}
                  className="text-xs bg-brand-orange text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors"
                >
                  View →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

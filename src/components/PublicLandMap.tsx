'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';

const parsePolygonCoords = (polyString: string | undefined): [number, number][] => {
  if (!polyString) return [];
  try {
    return polyString.split(';').map((pair) => {
      const [lat, lng] = pair.trim().split(',').map(Number);
      return [lat, lng] as [number, number];
    }).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));
  } catch {
    return [];
  }
};

// Full-bleed map — sized entirely by its parent container. The verify page
// renders this inside a fixed full-screen overlay, mirroring the dedicated
// permit-scan map view (map fills the screen, details float on top of it).
export default function PublicLandMap({ polygonBoundary }: { polygonBoundary: string }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const coords = parsePolygonCoords(polygonBoundary);
    if (coords.length < 3) return;

    const map = L.map(mapContainerRef.current, {
      attributionControl: false,
      zoomControl: false,
      preferCanvas: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    }).addTo(map);

    const polygon = L.polygon(coords, {
      color: '#2e7d32',
      weight: 2.5,
      fillColor: '#2e7d32',
      fillOpacity: 0.25,
      dashArray: '4',
    }).addTo(map);

    // The container mounts inside a fixed overlay whose layout settles a
    // frame after this effect runs, so an immediate fitBounds can compute
    // against a zero-size box — defer both calls past that.
    const timer = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(polygon.getBounds(), { padding: [30, 30] });
    }, 50);

    mapRef.current = map;

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, [polygonBoundary]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}

import boundariesData from '../data/boundaries.json';

export interface BoundaryRecord {
  id: string;
  rawXaafad: string;
  rawLaan: string;
  neighborhood: string;
  branch: string;
  polygon: [number, number][]; // [lng, lat]
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number };
  fillColor?: string;
  strokeColor?: string;
}

export interface BoundaryDetectionResult {
  neighborhood: string;
  branch: string;
  boundaryId: string;
  rawXaafad: string;
  rawLaan: string;
  confidence: 'exact' | 'near' | 'polygon_centroid';
  distanceMeters?: number;
}

export const ALL_NEIGHBORHOODS = [
  'Waaberi',
  'Towfiiq',
  'Horseed',
  'Cadaada',
  'Berdaale',
  'Isha',
  'Howlwadaag',
  'Salaamay',
  'Wadajir',
  'Daarasalaam',
] as const;

export const ALL_BRANCHES = [
  'Laanta 1aad',
  'Laanta 2aad',
  'Laanta 3aad',
  'Laanta 4aad',
  'Laanta 5aad',
  'Laanta 6aad',
  'Laanta 7aad',
  'Laanta 8aad',
] as const;

export function normalizeNeighborhood(raw?: string | null): string {
  if (!raw) return '';
  const clean = raw
    .trim()
    .replace(/^Xaafad(?:da)?\s+/i, '')
    .replace(/^Xafad(?:da)?\s+/i, '')
    .trim();

  // Normalize phonetic/spelling variations
  if (/^b[ae]rda+le$/i.test(clean)) return 'Berdaale';
  if (/^wa+b[ae]ri$/i.test(clean)) return 'Waaberi';
  if (/^towfi+q$/i.test(clean)) return 'Towfiiq';
  if (/^horse+d$/i.test(clean)) return 'Horseed';
  if (/^cada+da$/i.test(clean)) return 'Cadaada';
  if (/^isha$/i.test(clean)) return 'Isha';
  if (/^howlwada+g$/i.test(clean)) return 'Howlwadaag';
  if (/^sala+ma+y$/i.test(clean)) return 'Salaamay';
  if (/^wadajir$/i.test(clean)) return 'Wadajir';
  if (/^da+rasala+m$/i.test(clean)) return 'Daarasalaam';

  return clean;
}

export function normalizeBranch(raw?: string | null): string {
  if (!raw) return '';
  const clean = raw.trim();
  const match = clean.match(/(\d+)/);
  if (match) {
    const num = match[1];
    return `Laanta ${num}aad`;
  }
  return clean;
}

export const parsedBoundaries: BoundaryRecord[] = (() => {
  const list: BoundaryRecord[] = [];
  for (const item of (boundariesData as Array<{
    id: string;
    xaafad?: string;
    laan?: string;
    geojson?: string;
    strokeColor?: string;
    fillColor?: string;
  }>)) {
    try {
      if (!item.geojson) continue;
      const parsedGeo = typeof item.geojson === 'string' ? JSON.parse(item.geojson) : item.geojson;
      const coordinates: [number, number][] = parsedGeo?.geometry?.coordinates?.[0] || [];
      if (!Array.isArray(coordinates) || coordinates.length < 3) continue;

      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;

      for (const [lng, lat] of coordinates) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const rawXaafad = item.xaafad?.trim() || '';
      const rawLaan = item.laan?.trim() || '';

      list.push({
        id: item.id,
        rawXaafad,
        rawLaan,
        neighborhood: normalizeNeighborhood(rawXaafad),
        branch: normalizeBranch(rawLaan),
        polygon: coordinates,
        bbox: { minLng, maxLng, minLat, maxLat },
        fillColor: item.fillColor || parsedGeo?.properties?.fillColor,
        strokeColor: item.strokeColor || parsedGeo?.properties?.strokeColor,
      });
    } catch {
      // Ignore malformed items
    }
  }
  return list;
})();

/**
 * Standard Ray-Casting algorithm for Point-in-Polygon (PIP) testing.
 * @param point [lng, lat]
 * @param vs Array of [lng, lat]
 */
export function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Approximate distance in meters between two lat/lng coordinates (Haversine formula).
 */
function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Distance from point to polygon bounding box center (fallback helper).
 */
function getDistanceToBboxCenter(lat: number, lng: number, bbox: BoundaryRecord['bbox']): number {
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const centerLng = (bbox.minLng + bbox.maxLng) / 2;
  return getDistanceMeters(lat, lng, centerLat, centerLng);
}

/**
 * Detect neighborhood and branch for a given lat/lng coordinate.
 */
export function detectBoundaryFromCoordinates(lat: number, lng: number): BoundaryDetectionResult | null {
  if (isNaN(lat) || isNaN(lng)) return null;
  const point: [number, number] = [lng, lat];

  // 1. Direct Point-In-Polygon check
  for (const b of parsedBoundaries) {
    // Quick BBox check
    if (lng < b.bbox.minLng || lng > b.bbox.maxLng || lat < b.bbox.minLat || lat > b.bbox.maxLat) {
      continue;
    }
    if (isPointInPolygon(point, b.polygon)) {
      return {
        neighborhood: b.neighborhood,
        branch: b.branch,
        boundaryId: b.id,
        rawXaafad: b.rawXaafad,
        rawLaan: b.rawLaan,
        confidence: 'exact',
      };
    }
  }

  // 2. Near-boundary fallback (within 150 meters) if GPS has minor jitter
  let closestBoundary: BoundaryRecord | null = null;
  let minDistance = 150; // meters threshold

  for (const b of parsedBoundaries) {
    const dist = getDistanceToBboxCenter(lat, lng, b.bbox);
    if (dist < minDistance) {
      minDistance = dist;
      closestBoundary = b;
    }
  }

  if (closestBoundary) {
    return {
      neighborhood: closestBoundary.neighborhood,
      branch: closestBoundary.branch,
      boundaryId: closestBoundary.id,
      rawXaafad: closestBoundary.rawXaafad,
      rawLaan: closestBoundary.rawLaan,
      confidence: 'near',
      distanceMeters: Math.round(minDistance),
    };
  }

  return null;
}

/**
 * Parse a GPS string like "3.1192, 43.6498" or "3.1192 43.6498" and detect the boundary.
 */
export function detectBoundaryFromGpsString(gps: string): BoundaryDetectionResult | null {
  if (!gps || typeof gps !== 'string') return null;
  const parts = gps
    .trim()
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => !isNaN(n));

  if (parts.length >= 2) {
    const [lat, lng] = parts;
    return detectBoundaryFromCoordinates(lat, lng);
  }

  return null;
}

/**
 * Parse a polygon boundary string ("lat, lng; lat, lng; ...") and detect the containing boundary.
 */
export function detectBoundaryFromPolygonString(polygonText: string): BoundaryDetectionResult | null {
  if (!polygonText || typeof polygonText !== 'string') return null;

  const points = polygonText
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pair) => {
      const [lat, lng] = pair.split(',').map((n) => parseFloat(n.trim()));
      return { lat, lng };
    })
    .filter((pt) => !isNaN(pt.lat) && !isNaN(pt.lng));

  if (points.length === 0) return null;

  // 1. Calculate polygon centroid and test
  const sumLat = points.reduce((acc, p) => acc + p.lat, 0);
  const sumLng = points.reduce((acc, p) => acc + p.lng, 0);
  const centroidLat = sumLat / points.length;
  const centroidLng = sumLng / points.length;

  const centroidResult = detectBoundaryFromCoordinates(centroidLat, centroidLng);
  if (centroidResult) {
    return {
      ...centroidResult,
      confidence: 'polygon_centroid',
    };
  }

  // 2. Test individual polygon vertices
  for (const pt of points) {
    const ptResult = detectBoundaryFromCoordinates(pt.lat, pt.lng);
    if (ptResult && ptResult.confidence === 'exact') {
      return ptResult;
    }
  }

  return null;
}

/**
 * Detect boundary given survey fields (either polygon_boundary or gps_location).
 */
export function detectBoundaryFromSurveyLocation(
  gpsLocation?: string | null,
  polygonBoundary?: string | null
): BoundaryDetectionResult | null {
  if (polygonBoundary) {
    const polyResult = detectBoundaryFromPolygonString(polygonBoundary);
    if (polyResult) return polyResult;
  }

  if (gpsLocation) {
    const gpsResult = detectBoundaryFromGpsString(gpsLocation);
    if (gpsResult) return gpsResult;
  }

  return null;
}

/**
 * Returns GeoJSON FeatureCollection of all boundaries for rendering directly on Leaflet maps.
 */
export function getBoundariesGeoJSON() {
  return {
    type: 'FeatureCollection' as const,
    features: parsedBoundaries.map((b) => ({
      type: 'Feature' as const,
      id: b.id,
      properties: {
        id: b.id,
        xaafad: b.neighborhood,
        rawXaafad: b.rawXaafad,
        laan: b.branch,
        rawLaan: b.rawLaan,
        fillColor: b.fillColor || '#2563eb',
        strokeColor: b.strokeColor || '#1d4ed8',
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [b.polygon],
      },
    })),
  };
}

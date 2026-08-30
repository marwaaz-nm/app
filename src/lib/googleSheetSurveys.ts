import https from 'https';
import type { Survey } from '@/types';
import boundariesData from '@/data/boundaries.json';

const GOOGLE_SHEET_ID = '1SV7-2BuP0RTqL2qjV2ghjZWuqvfLndrI';
const GOOGLE_SHEET_NAME = 'MPN 2025';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(GOOGLE_SHEET_NAME)}`;

// In-memory cache
let cachedSurveys: Survey[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function normalizeNeighborhood(raw?: string | null): string {
  if (!raw) return '';
  const clean = raw
    .trim()
    .replace(/^Xaafad(?:da)?\s+/i, '')
    .replace(/^Xafad(?:da)?\s+/i, '')
    .trim();

  if (/^b[ae]rda+le$/i.test(clean)) return 'Berdaale';
  if (/^wa+b[ae]ri$/i.test(clean)) return 'Waaberi';
  if (/^towfi+q$/i.test(clean)) return 'Towfiiq';
  if (/^horsee+d$/i.test(clean)) return 'Horseed';
  if (/^cada+da$/i.test(clean)) return 'Cadaada';
  if (/^isha$/i.test(clean)) return 'Isha';
  if (/^howl\s*wada+g$/i.test(clean)) return 'Howlwadaag';
  if (/^sa+la+me+y$/i.test(clean)) return 'Salaamey';
  if (/^wadajir$/i.test(clean)) return 'Wadajir';
  if (/^da+ra?sala+m$/i.test(clean)) return 'Daarasalaam';
  if (/^daarusalaam$/i.test(clean)) return 'Daarasalaam';

  return clean;
}

function normalizeBranch(raw?: string | null): string {
  if (!raw) return '';
  const clean = raw.trim();
  const match = clean.match(/(\d+)/);
  if (match) {
    const num = match[1];
    return `Laanta ${num}aad`;
  }
  return clean;
}

interface BoundaryItem {
  neighborhood: string;
  branch: string;
  polygon: [number, number][];
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number };
}

const parsedBoundaries: BoundaryItem[] = (() => {
  const list: BoundaryItem[] = [];
  for (const item of (boundariesData as Array<{
    id: string;
    xaafad?: string;
    laan?: string;
    geojson?: string | { geometry?: { coordinates?: [number, number][][] } };
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
        neighborhood: normalizeNeighborhood(rawXaafad),
        branch: normalizeBranch(rawLaan),
        polygon: coordinates,
        bbox: { minLng, maxLng, minLat, maxLat },
      });
    } catch {
      // Ignore malformed geojson
    }
  }
  return list;
})();

function parseGps(gpsStr?: string | null): { lat: number; lng: number } | null {
  if (!gpsStr) return null;
  const parts = gpsStr.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
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

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function detectBoundaryFromGps(gpsLocation?: string | null): { neighborhood: string; branch: string } | null {
  const coords = parseGps(gpsLocation);
  if (!coords) return null;
  const point: [number, number] = [coords.lng, coords.lat];

  for (const b of parsedBoundaries) {
    if (isPointInPolygon(point, b.polygon)) {
      return { neighborhood: b.neighborhood, branch: b.branch };
    }
  }

  let nearest: BoundaryItem | null = null;
  let minDistance = Infinity;
  for (const b of parsedBoundaries) {
    const centerLat = (b.bbox.minLat + b.bbox.maxLat) / 2;
    const centerLng = (b.bbox.minLng + b.bbox.maxLng) / 2;
    const dist = distanceMeters(coords.lat, coords.lng, centerLat, centerLng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = b;
    }
  }

  if (nearest && minDistance <= 3000) {
    return { neighborhood: nearest.neighborhood, branch: nearest.branch };
  }
  return null;
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let cur = '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((x) => x.trim() !== '')) {
        lines.push(row);
      }
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur || row.length) {
    row.push(cur);
    if (row.some(x => x.trim() !== '')) lines.push(row);
  }
  return lines;
}

function parseBoundary(text?: string | null): { val: string | null; neighbor: string | null } {
  if (!text || !text.trim() || text.trim() === 'undefined' || text.trim() === 'null') {
    return { val: null, neighbor: null };
  }
  const clean = text.trim();
  // match e.g. "48.70m dhul banaan", "48.70mm dhul", "48.70 jid", "14.70m", "29m", "Jid"
  const m = clean.match(/^([0-9]+(?:\.[0-9]+)?(?:\s*m+)?)(?:\s+(.*))?$/i);
  if (m) {
    const rawVal = m[1].trim().replace(/\s*m+$/i, ''); // strips 'm', 'mm', ' m', etc.
    const rawNeighbor = m[2] ? m[2].trim() : null;
    const neighbor = rawNeighbor && rawNeighbor !== 'undefined' && rawNeighbor !== 'null' ? rawNeighbor : null;
    return { val: rawVal || null, neighbor };
  }
  return { val: null, neighbor: (clean !== 'undefined' && clean !== 'null') ? clean : null };
}

function parseDate(dStr?: string | null): string {
  if (!dStr || !dStr.trim()) return new Date().toISOString();
  const clean = dStr.trim();
  const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const m = parseInt(mdy[1], 10);
    const d = parseInt(mdy[2], 10);
    const y = parseInt(mdy[3], 10);
    return new Date(Date.UTC(y, m - 1, d)).toISOString();
  }
  const ymd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    return new Date(Date.UTC(y, m - 1, d)).toISOString();
  }
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

function fetchHttpCsv(targetUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    function request(u: string, redirectsRemaining = 5) {
      if (redirectsRemaining <= 0) {
        reject(new Error('Too many redirects fetching Google Sheet CSV'));
        return;
      }
      https
        .get(u, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            request(res.headers.location, redirectsRemaining - 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to fetch Google Sheet CSV: HTTP ${res.statusCode}`));
            return;
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    }
    request(targetUrl);
  });
}

import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'google_surveys.json');

// Attempt to load from disk on boot
function loadDiskCache(): { surveys: Survey[]; timestamp: number } | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.surveys) && data.surveys.length > 0) {
        return data;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveDiskCache(surveys: Survey[], timestamp: number) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ surveys, timestamp }), 'utf-8');
  } catch (err) {
    console.error('Failed to write surveys disk cache:', err);
  }
}

// Initialize from disk immediately
const initialDisk = loadDiskCache();
if (initialDisk) {
  cachedSurveys = initialDisk.surveys;
  lastFetchTime = initialDisk.timestamp;
}

let inFlightPromise: Promise<Survey[]> | null = null;

async function doFetchAndParse(): Promise<Survey[]> {
  const csvContent = await fetchHttpCsv(CSV_URL);
  const rows = parseCSV(csvContent);
  if (rows.length <= 1) {
    return cachedSurveys || [];
  }

  const surveys: Survey[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];

    // Virtual unique ID starting from 100000 to avoid ID collisions with DB surveys
    const id = 100000 + i;

    // S/N is strictly the row number index (1, 2, 3, ... 1725) as requested
    const serial_no = i;
    const survey_no = null;

    const owner_name = r[2]?.trim() || 'Aan la magacaabin';
    const created_at = parseDate(r[3]);
    const gps_location = r[13]?.trim() || undefined;

    let neighborhood = normalizeNeighborhood(r[5]?.trim());
    let branch = normalizeBranch(r[6]?.trim() || '');

    if (!neighborhood || !branch) {
      const detected = detectBoundaryFromGps(gps_location);
      if (detected) {
        if (!neighborhood) neighborhood = detected.neighborhood;
        if (!branch) branch = detected.branch;
      }
    }

    if (!neighborhood) neighborhood = 'Waaberi';
    if (!branch) branch = 'Laanta 1aad';

    const vicinity = r[7]?.trim() || undefined;
    const sketch_dimensions = r[8]?.trim() || undefined;

    const w = parseBoundary(r[9]);
    const b = parseBoundary(r[10]);
    const k = parseBoundary(r[11]);
    const g = parseBoundary(r[12]);

    let land_type = r[14]?.trim();
    const built_details = r[15]?.trim() || undefined;

    if (land_type === 'Guri Dhisan' || built_details) {
      land_type = 'Dhul dhisan';
    } else {
      land_type = 'Dhul Banaan';
    }

    // Column Q ("Soo Cabirey") provides the Record Creator
    const surveyorName = r[16]?.trim() || undefined;

    surveys.push({
      id,
      serial_no,
      survey_no,
      owner_name,
      neighborhood,
      branch,
      vicinity,
      land_type,
      built_details,
      boundary_w_val: w.val || undefined,
      boundary_w_neighbor: w.neighbor || undefined,
      boundary_b_val: b.val || undefined,
      boundary_b_neighbor: b.neighbor || undefined,
      boundary_k_val: k.val || undefined,
      boundary_k_neighbor: k.neighbor || undefined,
      boundary_g_val: g.val || undefined,
      boundary_g_neighbor: g.neighbor || undefined,
      gps_location,
      sketch_dimensions,
      status: 'Approved',
      created_at,
      created_by: surveyorName,
    });
  }

  cachedSurveys = surveys;
  lastFetchTime = Date.now();
  saveDiskCache(surveys, lastFetchTime);
  return surveys;
}

export async function getGoogleSheetSurveys(forceRefresh = false): Promise<Survey[]> {
  const now = Date.now();
  const isStale = !cachedSurveys || now - lastFetchTime >= CACHE_TTL_MS;

  if (cachedSurveys && !forceRefresh) {
    if (isStale && !inFlightPromise) {
      // Trigger background refresh without blocking response
      inFlightPromise = doFetchAndParse()
        .catch((err) => {
          console.error('Background fetch error for Google Sheet surveys:', err);
          return cachedSurveys || [];
        })
        .finally(() => {
          inFlightPromise = null;
        });
    }
    return cachedSurveys;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = doFetchAndParse()
    .catch((err) => {
      console.error('Error fetching Google Sheet surveys:', err);
      return cachedSurveys || [];
    })
    .finally(() => {
      inFlightPromise = null;
    });

  return inFlightPromise;
}

import https from 'https';
import type { Reference, Survey } from '@/types';
import { getGoogleSheetSurveys } from './googleSheetSurveys';

const GOOGLE_SHEET_ID = '1SV7-2BuP0RTqL2qjV2ghjZWuqvfLndrI';
const GOOGLE_SHEET_NAME = 'Reff Numbers 2025';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(GOOGLE_SHEET_NAME)}`;

// In-memory cache
let cachedReferences: Reference[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

function parseDate(raw?: string | null): string {
  if (!raw) return new Date().toISOString();
  const clean = raw.trim().replace(/^"/, '').replace(/"$/, '');
  const slashParts = clean.split('/');
  if (slashParts.length === 3) {
    const m = parseInt(slashParts[0], 10);
    const d = parseInt(slashParts[1], 10);
    let y = parseInt(slashParts[2], 10);
    if (y < 100) y += 2000;
    if (!isNaN(m) && !isNaN(d) && !isNaN(y)) {
      const date = new Date(y, m - 1, d, 12, 0, 0);
      return date.toISOString();
    }
  }
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

function fetchHttpCsv(targetUrl: string, redirectsRemaining = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectsRemaining <= 0) {
      reject(new Error('Too many redirects while fetching Google Sheet CSV'));
      return;
    }

    function request(u: string, remaining = redirectsRemaining) {
      if (remaining <= 0) {
        reject(new Error('Too many redirects while fetching Google Sheet CSV'));
        return;
      }
      https
        .get(u, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            request(res.headers.location, remaining - 1);
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
    request(targetUrl, redirectsRemaining);
  });
}

import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'google_references.json');

// Attempt to load from disk on boot
function loadDiskCache(): { references: Reference[]; timestamp: number } | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.references) && data.references.length > 0) {
        return data;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveDiskCache(references: Reference[], timestamp: number) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ references, timestamp }), 'utf-8');
  } catch (err) {
    console.error('Failed to write references disk cache:', err);
  }
}

// Initialize from disk immediately
const initialDisk = loadDiskCache();
if (initialDisk) {
  cachedReferences = initialDisk.references;
  lastFetchTime = initialDisk.timestamp;
}

let inFlightPromise: Promise<Reference[]> | null = null;

async function doFetchAndParse(): Promise<Reference[]> {
  const [csvContent, sheetSurveys] = await Promise.all([
    fetchHttpCsv(CSV_URL),
    getGoogleSheetSurveys().catch(() => [] as Survey[]),
  ]);

  const rows = parseCSV(csvContent);
  if (rows.length <= 1) {
    return cachedReferences || [];
  }

  // Build survey lookup maps for quick association
  const surveyByRowIndex = new Map<string, Survey>();
  const surveyByRawSn = new Map<string, Survey>();

  sheetSurveys.forEach((s) => {
    surveyByRowIndex.set(String(s.serial_no), s);
    if (s.survey_no) surveyByRawSn.set(String(s.survey_no), s);
  });

  const references: Reference[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];

    const rawRefNo = r[0]?.trim();
    if (!rawRefNo) continue;

    // Column J: Taarikhda (Date Issued)
    const dateStr = r[9]?.trim();
    const created_at = parseDate(dateStr);
    const yearFull = new Date(created_at).getFullYear();
    const year2 = String(yearFull).slice(-2);

    // Format Reference Number cleanly (e.g. NM/1995/25 or NM/3893/26)
    const ref_number = rawRefNo.includes('/') ? rawRefNo : `NM/${rawRefNo}/${year2}`;

    // Column C: Ujeedo (Subject)
    const subject = r[2]?.trim() || 'Aan la cayimin';

    // Column E: Dhul Lr. (Connected Land Survey)
    const connectedLandSurvey = r[4]?.trim();

    // Column G: FaahFaahin (Notes / Details)
    const details = r[6]?.trim() || undefined;

    // Column I: Waxaa Diyaariyey (Record Creator)
    const created_by = r[8]?.trim() || undefined;

    let matchedSurvey = connectedLandSurvey
      ? surveyByRowIndex.get(connectedLandSurvey) || surveyByRawSn.get(connectedLandSurvey)
      : undefined;

    const id = 200000 + i;

    references.push({
      id,
      ref_number,
      subject,
      details,
      status: 'Completed',
      issue_date: created_at,
      created_at,
      created_by,
      survey_id: matchedSurvey ? matchedSurvey.id : null,
      surveys: matchedSurvey
        ? {
            id: matchedSurvey.id,
            serial_no: matchedSurvey.serial_no,
            survey_no: matchedSurvey.survey_no,
            owner_name: matchedSurvey.owner_name,
            neighborhood: matchedSurvey.neighborhood,
            branch: matchedSurvey.branch,
            land_type: matchedSurvey.land_type,
            sketch_area: matchedSurvey.sketch_area,
            gps_location: matchedSurvey.gps_location,
            polygon_boundary: matchedSurvey.polygon_boundary,
            boundary_w_val: matchedSurvey.boundary_w_val,
            boundary_w_neighbor: matchedSurvey.boundary_w_neighbor,
            boundary_b_val: matchedSurvey.boundary_b_val,
            boundary_b_neighbor: matchedSurvey.boundary_b_neighbor,
            boundary_k_val: matchedSurvey.boundary_k_val,
            boundary_k_neighbor: matchedSurvey.boundary_k_neighbor,
            boundary_g_val: matchedSurvey.boundary_g_val,
            boundary_g_neighbor: matchedSurvey.boundary_g_neighbor,
          }
        : undefined,
      receipts: [],
    });
  }

  cachedReferences = references;
  lastFetchTime = Date.now();
  saveDiskCache(references, lastFetchTime);
  return references;
}

export async function getGoogleSheetReferences(forceRefresh = false): Promise<Reference[]> {
  const now = Date.now();
  const isStale = !cachedReferences || now - lastFetchTime >= CACHE_TTL_MS;

  if (cachedReferences && !forceRefresh) {
    if (isStale && !inFlightPromise) {
      // Trigger background refresh without blocking response
      inFlightPromise = doFetchAndParse()
        .catch((err) => {
          console.error('Background fetch error for Google Sheet references:', err);
          return cachedReferences || [];
        })
        .finally(() => {
          inFlightPromise = null;
        });
    }
    return cachedReferences;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = doFetchAndParse()
    .catch((err) => {
      console.error('Error fetching Google Sheet references:', err);
      return cachedReferences || [];
    })
    .finally(() => {
      inFlightPromise = null;
    });

  return inFlightPromise;
}

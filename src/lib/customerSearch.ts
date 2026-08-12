import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadFileContent, searchWordFiles, type DriveConnection, type DriveItem } from '@/lib/googleDrive';
import { extractDocxText } from '@/lib/docxText';
import { extractCustomerRecords, type CustomerRecord } from '@/lib/customerExtract';
import { hasIndexedDocuments, searchIndexedDocuments } from '@/lib/driveIndex';

export type CustomerSearchResult = CustomerRecord & {
  sourceFile: { id: string; name: string; webViewLink?: string };
  connectionName: string;
};

const MODERN_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Only applies to the live-Drive fallback below (a connection that's never been synced
// yet) — downloading a full document (often 1-2MB) live is the expensive step there, so
// candidates are capped to keep that fallback path's latency reasonable. Indexed search
// has no such cap: it checks every matching document, since reading cached text is cheap.
const MAX_CANDIDATE_FILES = 10;

// Extracted text is a few KB per file (vs. megabytes for the raw document), so caching
// it in memory is cheap and lets repeated/related searches skip re-downloading a file
// they've already read. Keyed by connection id + file id (two different connections
// could in principle have colliding Drive file ids) and modifiedTime so an edited
// document is re-fetched.
const textCache = new Map<string, { modifiedTime?: string; text: string; expiresAt: number }>();
const TEXT_CACHE_MS = 30 * 60 * 1000;

async function getDocxText(conn: DriveConnection, file: DriveItem): Promise<string> {
  const cacheKey = `${conn.id}::${file.id}`;
  const cached = textCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.modifiedTime === file.modifiedTime) {
    return cached.text;
  }
  const buffer = await downloadFileContent(conn, file.id);
  const text = await extractDocxText(buffer);
  textCache.set(cacheKey, { modifiedTime: file.modifiedTime, text, expiresAt: Date.now() + TEXT_CACHE_MS });
  return text;
}

// Live-Drive path: downloads and reads candidate documents on the spot. Used only as a
// fallback for a connection that's never been synced into the local index yet, so search
// still works (just slower) before the first "Sync Now" run in Settings.
async function searchCustomersLive(conn: DriveConnection, connectionName: string, query: string): Promise<CustomerSearchResult[]> {
  const candidates: DriveItem[] = (await searchWordFiles(conn, query))
    .filter((item) => item.mimeType === MODERN_DOCX_MIME)
    .slice(0, MAX_CANDIDATE_FILES);

  const perFile = await Promise.all(candidates.map(async (file): Promise<CustomerSearchResult[]> => {
    try {
      const text = await getDocxText(conn, file);
      const records = extractCustomerRecords(text, query);
      return records.map((record) => ({
        ...record,
        sourceFile: { id: file.id, name: file.name, webViewLink: file.webViewLink },
        connectionName,
      }));
    } catch {
      return [];
    }
  }));

  return perFile.flat();
}

// Indexed path: searches cached document text in Postgres instead of Drive, so it's
// fast and consistent regardless of network conditions — and checks every matching
// document rather than a capped top-N.
async function searchCustomersIndexed(admin: SupabaseClient, connectionId: number, connectionName: string, query: string): Promise<CustomerSearchResult[]> {
  const matches = await searchIndexedDocuments(admin, connectionId, query);
  return matches.flatMap((match) =>
    extractCustomerRecords(match.text, query).map((record) => ({
      ...record,
      sourceFile: { id: match.fileId, name: match.fileName, webViewLink: match.webViewLink },
      connectionName,
    })),
  );
}

async function searchCustomersInConnection(admin: SupabaseClient, conn: DriveConnection, connectionName: string, query: string): Promise<CustomerSearchResult[]> {
  // Always check the local index first — it's a single fast Postgres query — instead of
  // deciding indexed-vs-live upfront from a separate existence probe. A query that's
  // actually in the index now resolves straight from the database, full stop, without
  // waiting on an extra round-trip to find out the index exists before using it.
  const indexedResults = await searchCustomersIndexed(admin, conn.id, connectionName, query);
  if (indexedResults.length > 0) return indexedResults;

  // No match in the index. If this connection has been synced at all, trust that empty
  // result (it means genuinely not found) rather than paying for a live Drive search on
  // every miss. Only a connection that's never been synced falls through to live search.
  const indexed = await hasIndexedDocuments(admin, conn.id);
  if (indexed) return [];
  return searchCustomersLive(conn, connectionName, query);
}

// Finding a customer shouldn't require already knowing which connection/branch their
// record lives under, so this searches every active connection at once and aggregates
// the results — unlike Drive Files browsing, which is scoped to one connection the user
// explicitly picks.
export async function searchCustomers(admin: SupabaseClient, connections: { conn: DriveConnection; name: string }[], rawQuery: string): Promise<CustomerSearchResult[]> {
  const query = rawQuery.trim();
  if (!query || connections.length === 0) return [];

  const perConnection = await Promise.all(
    connections.map(({ conn, name }) => searchCustomersInConnection(admin, conn, name, query).catch(() => [])),
  );
  return perConnection.flat();
}

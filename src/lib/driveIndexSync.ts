import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadFileContent, listAllWordFilesInTree, type DriveConnection } from '@/lib/googleDrive';
import { extractDocxText } from '@/lib/docxText';
import { getIndexedFileMap, upsertIndexedDocuments, deleteIndexedDocuments, type IndexedDocument } from '@/lib/driveIndex';

const MODERN_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Kept comfortably under typical serverless function time limits — a sync call that
// hits this budget simply reports it's not done yet, and the caller invokes it again to
// continue where it left off.
const SYNC_TIME_BUDGET_MS = 8000;
// Downloading is I/O-bound (waiting on Drive's response), not CPU-bound, so one call can
// safely have many downloads in flight at once — this is the main lever for how many
// documents one call gets through inside its time budget.
const DOWNLOAD_BATCH_SIZE = 15;

// A full sync of a large connection takes many batched calls in a row (each one time-
// boxed to stay under serverless limits). Re-listing every file across the whole folder
// tree on every single batch call would dominate the sync's total time for no benefit —
// the live list barely changes between two calls a few seconds apart — so it's cached
// briefly per connection. Best-effort like the other in-memory caches in this codebase:
// helps a lot on a warm instance, costs nothing extra on a cold one.
const liveListingCache = new Map<number, { files: Awaited<ReturnType<typeof listAllWordFilesInTree>>; expiresAt: number }>();
const LIVE_LISTING_CACHE_MS = 15 * 60 * 1000;

async function getLiveWordFiles(conn: DriveConnection) {
  const cached = liveListingCache.get(conn.id);
  if (cached && cached.expiresAt > Date.now()) return cached.files;
  const files = await listAllWordFilesInTree(conn);
  liveListingCache.set(conn.id, { files, expiresAt: Date.now() + LIVE_LISTING_CACHE_MS });
  return files;
}

export type SyncProgress = {
  totalLive: number;
  totalPending: number;
  processedThisBatch: number;
  removedThisBatch: number;
  done: boolean;
};

function modifiedTimeChanged(indexed: string | null | undefined, live: string | null | undefined): boolean {
  if (!indexed || !live) return true;
  // Compare as instants, not raw strings — Postgres and Drive don't format
  // RFC3339 timestamps identically even when they mean the same moment.
  return new Date(indexed).getTime() !== new Date(live).getTime();
}

// Processes one time-boxed batch of a connection's index sync: diffs Drive's live file
// list against what's already indexed, removes rows for files no longer on Drive, and
// downloads+extracts+upserts new or changed files until the time budget runs out.
// Call again (the API route does this) until progress.done is true.
export async function syncConnectionIndex(admin: SupabaseClient, conn: DriveConnection, connectionId: number): Promise<SyncProgress> {
  const [liveFiles, indexedMap] = await Promise.all([
    getLiveWordFiles(conn),
    getIndexedFileMap(admin, connectionId),
  ]);

  const liveDocs = liveFiles.filter((f) => f.mimeType === MODERN_DOCX_MIME);
  const liveIds = new Set(liveDocs.map((f) => f.id));

  const staleIds = Array.from(indexedMap.keys()).filter((id) => !liveIds.has(id));
  if (staleIds.length > 0) await deleteIndexedDocuments(admin, connectionId, staleIds);

  const pending = liveDocs.filter((f) => modifiedTimeChanged(indexedMap.get(f.id), f.modifiedTime));
  if (pending.length === 0) {
    return { totalLive: liveDocs.length, totalPending: 0, processedThisBatch: 0, removedThisBatch: staleIds.length, done: true };
  }

  // The client fires several of these calls concurrently for real throughput (separate
  // requests, not just concurrent downloads within one) — see DriveConnectionsPanel's
  // sync loop. Each call independently recomputes "pending" from the same live/indexed
  // diff, so without this, concurrent calls would all start at index 0 and redundantly
  // race for the exact same documents. Starting from a random offset (wrapping around)
  // spreads concurrent calls across different documents instead.
  const startOffset = Math.floor(Math.random() * pending.length);

  const t0 = Date.now();
  let processed = 0;
  let taken = 0;
  while (taken < pending.length && Date.now() - t0 < SYNC_TIME_BUDGET_MS) {
    const batch: typeof pending = [];
    for (let k = 0; k < DOWNLOAD_BATCH_SIZE && taken < pending.length; k++, taken++) {
      batch.push(pending[(startOffset + taken) % pending.length]);
    }

    const docs = await Promise.all(batch.map(async (file): Promise<IndexedDocument | null> => {
      try {
        const buffer = await downloadFileContent(conn, file.id);
        const text = await extractDocxText(buffer);
        return { fileId: file.id, fileName: file.name, webViewLink: file.webViewLink, modifiedTime: file.modifiedTime, text };
      } catch {
        return null;
      }
    }));
    const okDocs = docs.filter((d): d is IndexedDocument => d !== null);
    await upsertIndexedDocuments(admin, connectionId, okDocs);
    processed += okDocs.length;
  }

  return {
    totalLive: liveDocs.length,
    totalPending: Math.max(0, pending.length - processed),
    processedThisBatch: processed,
    removedThisBatch: staleIds.length,
    done: taken >= pending.length,
  };
}

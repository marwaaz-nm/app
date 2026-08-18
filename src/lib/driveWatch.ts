import 'server-only';

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  downloadFileContent,
  getStartPageToken,
  listDriveChanges,
  stopDriveWatch,
  watchDriveChanges,
  type DriveConnection,
} from '@/lib/googleDrive';
import { extractDocxText } from '@/lib/docxText';
import { upsertIndexedDocuments, deleteIndexedDocuments, getIndexedFileMap, type IndexedDocument } from '@/lib/driveIndex';

const MODERN_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WEBHOOK_PATH = '/api/drive-webhook';
const DOCX_EXTRACTION_CONCURRENCY = 3;

type ProcessingClaim = { acquired: boolean; distributed: boolean };
type LocalProcessingState = { pending: boolean };
const localProcessing = new Map<number, LocalProcessingState>();
let processingRpcAvailable: boolean | null = null;

function isMissingProcessingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42883'
    || error.code === 'PGRST202'
    || Boolean(error.message?.includes('claim_drive_watch_processing'));
}

// The database lease coordinates separate Vercel instances. The in-memory fallback
// keeps deployments safe while the migration is being rolled out, and still dedupes
// overlapping notifications that land on the same warm instance.
export async function claimDriveChangeProcessing(admin: SupabaseClient, connectionId: number): Promise<ProcessingClaim> {
  if (processingRpcAvailable === false) return claimLocalDriveChangeProcessing(connectionId);

  const { data, error } = await admin.rpc('claim_drive_watch_processing', {
    p_connection_id: connectionId,
    p_lease_seconds: 120,
  });
  if (!error) {
    processingRpcAvailable = true;
    return { acquired: data === true, distributed: true };
  }
  if (!isMissingProcessingRpc(error)) throw error;
  processingRpcAvailable = false;

  return claimLocalDriveChangeProcessing(connectionId);
}

function claimLocalDriveChangeProcessing(connectionId: number): ProcessingClaim {
  const current = localProcessing.get(connectionId);
  if (current) {
    current.pending = true;
    return { acquired: false, distributed: false };
  }
  localProcessing.set(connectionId, { pending: false });
  return { acquired: true, distributed: false };
}

export async function finishDriveChangeProcessing(
  admin: SupabaseClient,
  connectionId: number,
  distributed: boolean,
): Promise<boolean> {
  if (distributed) {
    const { data, error } = await admin.rpc('finish_drive_watch_processing', { p_connection_id: connectionId });
    if (error) throw error;
    return data === true;
  }

  const current = localProcessing.get(connectionId);
  if (current?.pending) {
    current.pending = false;
    return true;
  }
  localProcessing.delete(connectionId);
  return false;
}

export async function releaseDriveChangeProcessing(
  admin: SupabaseClient,
  connectionId: number,
  distributed: boolean,
): Promise<void> {
  if (distributed) {
    const { error } = await admin.rpc('release_drive_watch_processing', { p_connection_id: connectionId });
    if (error) console.error('[drive-webhook] failed to release processing lease', { connectionId, error: error.message });
  } else {
    localProcessing.delete(connectionId);
  }
}

export type WatchStatus = { active: boolean; expiresAt: string | null };

export type ChannelLookup = {
  connectionId: number;
  conn: DriveConnection;
  channelToken: string | null;
  pageToken: string | null;
};

function toConn(row: { id: number; client_email: string; private_key: string; root_folder_id: string }): DriveConnection {
  return { id: row.id, clientEmail: row.client_email, privateKey: row.private_key, rootFolderId: row.root_folder_id };
}

export async function getWatchStatus(admin: SupabaseClient, connectionId: number): Promise<WatchStatus> {
  const { data, error } = await admin
    .from('drive_connections')
    .select('watch_channel_id, watch_expires_at')
    .eq('id', connectionId)
    .single();
  if (error || !data) return { active: false, expiresAt: null };
  const active = Boolean(data.watch_channel_id) && Boolean(data.watch_expires_at) && new Date(data.watch_expires_at).getTime() > Date.now();
  return { active, expiresAt: data.watch_expires_at || null };
}

// Looks up which connection a webhook notification belongs to, by the channel id Google
// echoes back in the X-Goog-Channel-ID header.
export async function findConnectionByChannelId(admin: SupabaseClient, channelId: string): Promise<ChannelLookup | null> {
  const { data, error } = await admin
    .from('drive_connections')
    .select('id, client_email, private_key, root_folder_id, watch_channel_token, watch_page_token')
    .eq('watch_channel_id', channelId)
    .maybeSingle();
  if (error || !data) return null;
  return { connectionId: data.id, conn: toConn(data), channelToken: data.watch_channel_token, pageToken: data.watch_page_token };
}

// Connections whose channel is missing entirely, or expires within `withinMs` — used by
// the daily renewal cron so a channel never silently lapses past Drive's 7-day max.
export async function listConnectionsNeedingWatchRenewal(admin: SupabaseClient, withinMs: number): Promise<{ connectionId: number; conn: DriveConnection; oldChannelId: string | null; oldResourceId: string | null; pageToken: string | null }[]> {
  const { data, error } = await admin
    .from('drive_connections')
    .select('id, client_email, private_key, root_folder_id, watch_channel_id, watch_resource_id, watch_page_token, watch_expires_at')
    .eq('is_active', true);
  if (error) throw error;

  const threshold = Date.now() + withinMs;
  return (data || [])
    .filter((row) => !row.watch_expires_at || new Date(row.watch_expires_at).getTime() < threshold)
    .map((row) => ({
      connectionId: row.id,
      conn: toConn(row),
      oldChannelId: row.watch_channel_id,
      oldResourceId: row.watch_resource_id,
      pageToken: row.watch_page_token,
    }));
}

// Registers a fresh Drive push-notification channel for a connection (used both for the
// first-time "Enable Live Sync" action and for renewal before the old channel expires).
// If a page token is already stored (renewal case), it's reused so no changes are missed
// across the swap; otherwise a fresh start-page-token is fetched (first-time case).
export async function registerWatch(
  admin: SupabaseClient,
  connectionId: number,
  conn: DriveConnection,
  baseUrl: string,
  existing?: { channelId: string | null; resourceId: string | null; pageToken: string | null },
): Promise<{ expiresAt: string }> {
  if (existing?.channelId && existing.resourceId) {
    await stopDriveWatch(conn, existing.channelId, existing.resourceId);
  }

  const pageToken = existing?.pageToken || (await getStartPageToken(conn));
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomBytes(24).toString('hex');
  const address = `${baseUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`;

  const { resourceId, expiration } = await watchDriveChanges(conn, { channelId, address, token: channelToken, pageToken });
  const expiresAt = new Date(Number(expiration)).toISOString();

  const { error } = await admin
    .from('drive_connections')
    .update({
      watch_channel_id: channelId,
      watch_resource_id: resourceId,
      watch_channel_token: channelToken,
      watch_page_token: pageToken,
      watch_expires_at: expiresAt,
    })
    .eq('id', connectionId);
  if (error) throw error;

  return { expiresAt };
}

// Pulls whatever changed since the connection's stored cursor and applies it to the
// index: updated/added Word docs are re-downloaded and re-extracted, removed/trashed
// files are dropped from the index. Advances the stored cursor so the next notification
// only processes what's new since this call.
export async function processDriveChanges(admin: SupabaseClient, conn: DriveConnection, connectionId: number, pageToken: string): Promise<{ processed: number; removed: number }> {
  const { changes, newStartPageToken } = await listDriveChanges(conn, pageToken);

  // A change log can contain several entries for the same file. Only its latest state
  // matters; parsing every intermediate version wastes the majority of webhook CPU.
  const latestByFileId = new Map<string, (typeof changes)[number]>();
  for (const change of changes) latestByFileId.set(change.fileId, change);
  const latestChanges = Array.from(latestByFileId.values());

  const toDelete = latestChanges
    .filter((change) => change.removed || change.file?.trashed)
    .map((change) => change.fileId);
  const upsertCandidates = latestChanges.filter(
    (change) => !change.removed
      && change.file
      && !change.file.trashed
      && change.file.mimeType === MODERN_DOCX_MIME,
  );

  if (toDelete.length > 0) await deleteIndexedDocuments(admin, connectionId, toDelete);

  let processed = 0;
  if (upsertCandidates.length > 0) {
    const indexedMap = await getIndexedFileMap(admin, connectionId);
    const toUpsert = upsertCandidates.filter((change) => {
      const indexedTime = indexedMap.get(change.fileId);
      const liveTime = change.file?.modifiedTime;
      if (!indexedTime || !liveTime) return true;
      return new Date(indexedTime).getTime() !== new Date(liveTime).getTime();
    });

    for (let offset = 0; offset < toUpsert.length; offset += DOCX_EXTRACTION_CONCURRENCY) {
      const batch = toUpsert.slice(offset, offset + DOCX_EXTRACTION_CONCURRENCY);
      const docs = await Promise.all(batch.map(async (change): Promise<IndexedDocument | null> => {
        try {
          const buffer = await downloadFileContent(conn, change.fileId);
          const text = await extractDocxText(buffer);
          return {
            fileId: change.fileId,
            fileName: change.file!.name,
            webViewLink: change.file!.webViewLink,
            modifiedTime: change.file!.modifiedTime,
            text,
          };
        } catch (error) {
          console.error('[drive-webhook] document extraction failed', {
            connectionId,
            fileId: change.fileId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }));
      const okDocs = docs.filter((doc): doc is IndexedDocument => doc !== null);
      await upsertIndexedDocuments(admin, connectionId, okDocs);
      processed += okDocs.length;
    }
  }

  if (newStartPageToken) {
    await admin.from('drive_connections').update({ watch_page_token: newStartPageToken }).eq('id', connectionId);
  }

  return { processed, removed: toDelete.length };
}

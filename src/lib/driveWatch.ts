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
import { upsertIndexedDocuments, deleteIndexedDocuments } from '@/lib/driveIndex';

const MODERN_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WEBHOOK_PATH = '/api/drive-webhook';

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

  const toDelete: string[] = [];
  const toUpsert = changes.filter((c) => !c.removed && c.file && !c.file.trashed && c.file.mimeType === MODERN_DOCX_MIME);
  for (const c of changes) {
    if (c.removed || c.file?.trashed) toDelete.push(c.fileId);
  }

  if (toDelete.length > 0) await deleteIndexedDocuments(admin, connectionId, toDelete);

  let processed = 0;
  if (toUpsert.length > 0) {
    const docs = await Promise.all(toUpsert.map(async (c) => {
      try {
        const buffer = await downloadFileContent(conn, c.fileId);
        const text = await extractDocxText(buffer);
        return { fileId: c.fileId, fileName: c.file!.name, webViewLink: c.file!.webViewLink, modifiedTime: c.file!.modifiedTime, text };
      } catch {
        return null;
      }
    }));
    const okDocs = docs.filter((d): d is NonNullable<typeof d> => d !== null);
    await upsertIndexedDocuments(admin, connectionId, okDocs);
    processed = okDocs.length;
  }

  if (newStartPageToken) {
    await admin.from('drive_connections').update({ watch_page_token: newStartPageToken }).eq('id', connectionId);
  }

  return { processed, removed: toDelete.length };
}

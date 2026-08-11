import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type IndexedDocument = {
  fileId: string;
  fileName: string;
  webViewLink?: string;
  modifiedTime?: string;
  text: string;
};

export type IndexStatus = { count: number; lastIndexedAt: string | null };

// A cheap existence probe (LIMIT 1, no COUNT) — used on the search hot path to decide
// indexed-vs-live-fallback, where getIndexStatus's exact count/lastIndexedAt would be
// unnecessary extra round-trips. getIndexStatus is for the Settings status display.
export async function hasIndexedDocuments(admin: SupabaseClient, connectionId: number): Promise<boolean> {
  const { data, error } = await admin
    .from('drive_document_index')
    .select('id')
    .eq('connection_id', connectionId)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

export async function getIndexStatus(admin: SupabaseClient, connectionId: number): Promise<IndexStatus> {
  const [{ count, error: countError }, { data: latest, error: latestError }] = await Promise.all([
    admin.from('drive_document_index').select('id', { count: 'exact', head: true }).eq('connection_id', connectionId),
    admin
      .from('drive_document_index')
      .select('indexed_at')
      .eq('connection_id', connectionId)
      .order('indexed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countError) throw countError;
  if (latestError) throw latestError;
  return { count: count || 0, lastIndexedAt: latest?.indexed_at || null };
}

// fileId -> modifiedTime, used by the sync job to diff against Drive's live listing and
// figure out what's new, changed, or deleted without re-downloading everything.
export async function getIndexedFileMap(admin: SupabaseClient, connectionId: number): Promise<Map<string, string | null>> {
  const { data, error } = await admin
    .from('drive_document_index')
    .select('file_id, modified_time')
    .eq('connection_id', connectionId);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.file_id, row.modified_time]));
}

export async function upsertIndexedDocuments(admin: SupabaseClient, connectionId: number, docs: IndexedDocument[]): Promise<void> {
  if (docs.length === 0) return;
  const rows = docs.map((doc) => ({
    connection_id: connectionId,
    file_id: doc.fileId,
    file_name: doc.fileName,
    web_view_link: doc.webViewLink || null,
    modified_time: doc.modifiedTime || null,
    extracted_text: doc.text,
    indexed_at: new Date().toISOString(),
  }));
  const { error } = await admin.from('drive_document_index').upsert(rows, { onConflict: 'connection_id,file_id' });
  if (error) throw error;
}

export async function deleteIndexedDocuments(admin: SupabaseClient, connectionId: number, fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const { error } = await admin
    .from('drive_document_index')
    .delete()
    .eq('connection_id', connectionId)
    .in('file_id', fileIds);
  if (error) throw error;
}

export type IndexedMatch = { fileId: string; fileName: string; webViewLink?: string; text: string };

// Searches cached document text instead of hitting Drive live — this is what makes
// Macmiisha search fast and consistent regardless of network conditions, once a
// connection has been synced at least once.
export async function searchIndexedDocuments(admin: SupabaseClient, connectionId: number, query: string): Promise<IndexedMatch[]> {
  const { data, error } = await admin
    .from('drive_document_index')
    .select('file_id, file_name, web_view_link, extracted_text')
    .eq('connection_id', connectionId)
    .ilike('extracted_text', `%${query}%`);
  if (error) throw error;
  return (data || []).map((row) => ({
    fileId: row.file_id,
    fileName: row.file_name,
    webViewLink: row.web_view_link || undefined,
    text: row.extracted_text,
  }));
}

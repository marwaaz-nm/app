import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DriveConnection } from '@/lib/googleDrive';

export type DriveConnectionSummary = { id: number; name: string };

const NOT_CONFIGURED_ERROR = () => Object.assign(
  new Error('Wali lama diyaarin xidhiidh Google Drive ah. Admin-ka: aad Settings > Drive Connections oo ku dar mid.'),
  { status: 503 },
);

// Column list on drive_connections is 42703 (undefined_column) / 42P01 (undefined_table)
// safe to detect via apiError()'s existing handling — no special-casing needed here.

export async function listDriveConnectionSummaries(admin: SupabaseClient): Promise<DriveConnectionSummary[]> {
  const { data, error } = await admin
    .from('drive_connections')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listDriveConnectionsFull(admin: SupabaseClient): Promise<(DriveConnectionSummary & { rootFolderId: string; createdAt: string })[]> {
  const { data, error } = await admin
    .from('drive_connections')
    .select('id, name, root_folder_id, created_at')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, name: row.name, rootFolderId: row.root_folder_id, createdAt: row.created_at }));
}

export async function getDriveConnection(admin: SupabaseClient, id: number): Promise<DriveConnection> {
  const { data, error } = await admin
    .from('drive_connections')
    .select('id, client_email, private_key, root_folder_id, is_active')
    .eq('id', id)
    .single();
  if (error || !data) throw NOT_CONFIGURED_ERROR();
  if (!data.is_active) throw Object.assign(new Error('Xidhiidhkan Drive ah waa la damiyay (inactive).'), { status: 404 });
  return { id: data.id, clientEmail: data.client_email, privateKey: data.private_key, rootFolderId: data.root_folder_id };
}

// Used by customer search, which spans every active connection rather than one picked
// by the user.
export async function getAllActiveDriveConnections(admin: SupabaseClient): Promise<DriveConnection[]> {
  const { data, error } = await admin
    .from('drive_connections')
    .select('id, client_email, private_key, root_folder_id')
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, clientEmail: row.client_email, privateKey: row.private_key, rootFolderId: row.root_folder_id }));
}

export type DriveConnectionInput = {
  name: string;
  clientEmail: string;
  privateKey: string;
  rootFolderId: string;
};

export async function createDriveConnection(admin: SupabaseClient, input: DriveConnectionInput): Promise<DriveConnectionSummary> {
  const { data, error } = await admin
    .from('drive_connections')
    .insert({ name: input.name, client_email: input.clientEmail, private_key: input.privateKey, root_folder_id: input.rootFolderId })
    .select('id, name')
    .single();
  if (error || !data) throw error || new Error('Xidhiidhka lama abuuri karin.');
  return data;
}

// privateKey is optional on update — omitting it keeps the existing key (the client
// never re-receives it, so it can't round-trip an update without one).
export async function updateDriveConnection(
  admin: SupabaseClient,
  id: number,
  input: Partial<DriveConnectionInput> & { isActive?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.clientEmail !== undefined) patch.client_email = input.clientEmail;
  if (input.privateKey) patch.private_key = input.privateKey;
  if (input.rootFolderId !== undefined) patch.root_folder_id = input.rootFolderId;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  patch.updated_at = new Date().toISOString();

  const { error } = await admin.from('drive_connections').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDriveConnection(admin: SupabaseClient, id: number): Promise<void> {
  const { error } = await admin.from('drive_connections').delete().eq('id', id);
  if (error) throw error;
}

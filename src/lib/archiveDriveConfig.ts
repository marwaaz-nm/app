import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchiveDriveConfig } from '@/lib/driveArchive';

const NOT_CONFIGURED_ERROR = () => Object.assign(
  new Error('Wali lama diyaarin xidhiidhka Document Archive. Admin-ka: aad Settings > Document Archive oo ku dar xogta.'),
  { status: 503 },
);

export async function getArchiveDriveConfig(admin: SupabaseClient): Promise<ArchiveDriveConfig> {
  const { data, error } = await admin
    .from('archive_drive_settings')
    .select('script_url, shared_secret')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data || !data.script_url || !data.shared_secret) throw NOT_CONFIGURED_ERROR();
  return { scriptUrl: data.script_url, sharedSecret: data.shared_secret };
}

export type ArchiveDriveConfigSummary = { configured: boolean; scriptUrl: string | null; rootFolderId: string | null };

export async function getArchiveDriveConfigSummary(admin: SupabaseClient): Promise<ArchiveDriveConfigSummary> {
  const { data } = await admin
    .from('archive_drive_settings')
    .select('script_url, root_folder_id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  return { configured: Boolean(data?.script_url), scriptUrl: data?.script_url || null, rootFolderId: data?.root_folder_id || null };
}

export type ArchiveDriveConfigInput = { scriptUrl: string; sharedSecret: string; rootFolderId: string };

// Single-row settings table: replace whatever's there rather than managing an id.
export async function setArchiveDriveConfig(admin: SupabaseClient, input: ArchiveDriveConfigInput): Promise<void> {
  const { data: existing } = await admin.from('archive_drive_settings').select('id').order('id', { ascending: true }).limit(1).maybeSingle();
  const patch = { script_url: input.scriptUrl, shared_secret: input.sharedSecret, root_folder_id: input.rootFolderId, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await admin.from('archive_drive_settings').update(patch).eq('id', existing.id)
    : await admin.from('archive_drive_settings').insert(patch);
  if (error) throw error;
}

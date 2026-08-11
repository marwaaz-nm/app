import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const driveSupabaseUrl = process.env.DRIVE_SUPABASE_URL || '';
const driveServiceRoleKey = process.env.DRIVE_SUPABASE_SERVICE_ROLE_KEY || '';

let cached: SupabaseClient | null = null;

// A separate Supabase project holds drive_connections + drive_document_index — kept
// apart from the main app database so the document-text index (which grows with every
// synced Word document) doesn't compete with the main project's storage quota. User
// auth (requireViewer) still goes through the main project via getAdminClient(); this
// client is only ever used for Drive-related tables.
export function getDriveAdminClient(): SupabaseClient {
  if (!driveSupabaseUrl || !driveServiceRoleKey) {
    throw Object.assign(new Error('Drive Supabase project is not configured.'), { status: 503 });
  }
  if (!cached) {
    cached = createClient(driveSupabaseUrl, driveServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}

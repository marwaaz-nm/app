import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const publicReferenceHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export function publicReferenceError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: publicReferenceHeaders });
}
export async function authorizePublicReference(client: SupabaseClient, id: string) {
  // Database counters are shared across instances; raw bearer codes are never stored here.
  // Missing migration or database outage fails closed, before any document lookup.
  const key = createHash('sha256').update(id.toLowerCase()).digest('hex');
  const { data, error } = await client.rpc('allow_public_reference_request', { token_hash: key });
  if (error || typeof data !== 'boolean') return publicReferenceError('Service temporarily unavailable', 503);
  if (!data) return NextResponse.json({ error: 'Too many requests' }, {
    status: 429, headers: { ...publicReferenceHeaders, 'Retry-After': '60' },
  });
  return null;
}

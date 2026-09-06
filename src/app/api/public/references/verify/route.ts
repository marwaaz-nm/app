import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeSheetReference } from '@/lib/publicReferenceCode';
import { authorizePublicReference, publicReferenceHeaders } from '@/lib/publicReferenceAccess';
import { documentContainsPhone, normalizePhone } from '@/lib/publicPhoneVerification';

const allowedOrigin = 'https://www.marwaazpn.com';
const corsHeaders = { ...publicReferenceHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: corsHeaders });
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { auth: { autoRefreshToken: false, persistSession: false } });

export function OPTIONS(request: NextRequest) {
  return request.headers.get('origin') === allowedOrigin ? new NextResponse(null, { status: 204, headers: corsHeaders }) : new NextResponse(null, { status: 403, headers: publicReferenceHeaders });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== allowedOrigin) return reply({ error: 'verification_failed' }, 403);
  let reference: string | null = null; let phone: string | null = null;
  try {
    const raw = await request.text();
    if (raw.length > 512) return reply({ error: 'verification_failed' }, 400);
    const body = JSON.parse(raw); reference = normalizeSheetReference(body.reference); phone = normalizePhone(body.phone);
  } catch { return reply({ error: 'verification_failed' }, 400); }
  if (!reference || !phone) return reply({ error: 'verification_failed' }, 400);
  try {
    const client = admin();
    const denied = await authorizePublicReference(client, `phone:${reference}`);
    if (denied) return reply({ error: denied.status === 429 ? 'rate_limited' : 'verification_failed' }, denied.status);
    const rawNumber = reference.split('/')[1];
    const { data: documents, error } = await client.from('drive_document_index').select('extracted_text').ilike('file_name', `${rawNumber}%`).limit(20);
    if (error || !documents?.some((document) => documentContainsPhone(document.extracted_text, phone!))) return reply({ error: 'verification_failed' }, 404);
    const { getGoogleSheetReferences } = await import('@/lib/googleSheetReferences');
    const records = await getGoogleSheetReferences();
    const match = records.find((item) => normalizeSheetReference(item.ref_number) === reference);
    if (!match) return reply({ error: 'verification_failed' }, 404);
    return reply({ reference: { ref_number: match.ref_number, subject: match.subject, issue_date: match.issue_date, surveys: match.surveys || null } });
  } catch { console.error('Phone verification failed'); return reply({ error: 'verification_failed' }, 503); }
}

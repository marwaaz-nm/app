import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseAndVerifyToken } from '@/lib/verificationToken';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Server-only admin client — this route is intentionally unauthenticated
// (scanned from a printed QR code), so it hand-picks only the fields safe
// to expose publicly rather than returning the full row.
const getAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Role Key is missing in environment variables.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing reference identifier' }, { status: 400 });
  }

  try {
    const supabaseAdmin = getAdminClient();
    const selectFields = `
      ref_number,
      subject,
      issue_date,
      archive_file_name,
      surveys (
        serial_no,
        owner_name,
        neighborhood,
        land_type,
        sketch_area,
        gps_location,
        polygon_boundary,
        boundary_w_val,
        boundary_w_neighbor,
        boundary_b_val,
        boundary_b_neighbor,
        boundary_k_val,
        boundary_k_neighbor,
        boundary_g_val,
        boundary_g_neighbor
      )
    `;

    // 1. Try Cryptographically Signed Verification Token (e.g. "125-9a8b7c6d5e4f3a2b")
    const signedRefId = parseAndVerifyToken(id);
    if (signedRefId) {
      const { data: reference, error } = await supabaseAdmin
        .from('references')
        .select(selectFields)
        .eq('id', signedRefId)
        .maybeSingle();

      if (!error && reference) {
        return NextResponse.json({ reference });
      }
    }

    // 2. Try UUID verification_token column (if column exists on DB)
    try {
      const { data: reference, error } = await supabaseAdmin
        .from('references')
        .select(selectFields)
        .eq('verification_token', id)
        .maybeSingle();

      if (!error && reference) {
        return NextResponse.json({ reference });
      }
    } catch {
      // Column verification_token may not exist on remote DB yet
    }

    // 3. Fallback: Numeric ID (legacy QR codes)
    if (/^\d+$/.test(id)) {
      const refId = parseInt(id, 10);
      const { data: reference, error } = await supabaseAdmin
        .from('references')
        .select(selectFields)
        .eq('id', refId)
        .maybeSingle();

      if (!error && reference) {
        return NextResponse.json({ reference });
      }
    }

    return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
  } catch (err) {
    console.error('Error fetching public reference:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

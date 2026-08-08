import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // 1. Try finding by secure verification_token first (UUID / unguessable token)
    let { data: reference, error } = await supabaseAdmin
      .from('references')
      .select(selectFields)
      .eq('verification_token', id)
      .maybeSingle();

    // 2. Fallback: If not found by verification_token and id is numeric (legacy QR codes)
    if (!reference && /^\d+$/.test(id)) {
      const refId = parseInt(id, 10);
      const res = await supabaseAdmin
        .from('references')
        .select(selectFields)
        .eq('id', refId)
        .maybeSingle();
      reference = res.data;
      error = res.error;
    }

    if (error || !reference) {
      return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
    }

    return NextResponse.json({ reference });
  } catch (err) {
    console.error('Error fetching public reference:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

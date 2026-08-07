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
  const refId = parseInt(id, 10);
  if (isNaN(refId)) {
    return NextResponse.json({ error: 'Invalid reference id' }, { status: 400 });
  }

  try {
    const supabaseAdmin = getAdminClient();
    const { data: reference, error } = await supabaseAdmin
      .from('references')
      .select(`
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
      `)
      .eq('id', refId)
      .single();

    if (error || !reference) {
      return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
    }

    return NextResponse.json({ reference });
  } catch (err) {
    console.error('Error fetching public reference:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

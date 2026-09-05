import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPublicReferenceCode } from '@/lib/publicReferenceCode';
import { authorizePublicReference, publicReferenceError, publicReferenceHeaders } from '@/lib/publicReferenceAccess';

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
  if (!isPublicReferenceCode(id)) return publicReferenceError('Reference not found', 404);

  try {
    const supabaseAdmin = getAdminClient();
    const denied = await authorizePublicReference(supabaseAdmin, id);
    if (denied) return denied;
    const selectFields = `
      ref_number,
      subject,
      issue_date,
      archive_drive_file_id,
      archive_file_name,
      surveys (
        serial_no,
        survey_no,
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

    const { data: reference, error } = await supabaseAdmin
      .from('references').select(selectFields).eq('verification_token', id.toLowerCase()).maybeSingle();
    if (error) return publicReferenceError('Service temporarily unavailable', 503);
    if (reference) return NextResponse.json({ reference }, { headers: publicReferenceHeaders });

    return publicReferenceError('Reference not found', 404);
  } catch (err) {
    console.error('Public reference lookup failed');
    return publicReferenceError('Service temporarily unavailable', 503);
  }
}

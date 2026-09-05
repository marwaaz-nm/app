import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPublicReferenceCode, normalizeSheetReference } from '@/lib/publicReferenceCode';
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
  const sheetReference = normalizeSheetReference(id);
  if (!isPublicReferenceCode(id) && !sheetReference) return publicReferenceError('Reference not found', 404);

  try {
    const supabaseAdmin = getAdminClient();
    const lookupKey = sheetReference || id.toLowerCase();
    const denied = await authorizePublicReference(supabaseAdmin, lookupKey);
    if (denied) return denied;
    if (sheetReference) {
      const { getGoogleSheetReferences } = await import('@/lib/googleSheetReferences');
      const references = await getGoogleSheetReferences();
      const match = references.find((reference) => normalizeSheetReference(reference.ref_number) === sheetReference);
      if (!match) return publicReferenceError('Reference not found', 404);
      const survey = match.surveys ? {
        serial_no: match.surveys.serial_no,
        survey_no: match.surveys.survey_no,
        owner_name: match.surveys.owner_name,
        neighborhood: match.surveys.neighborhood,
        land_type: match.surveys.land_type,
        sketch_area: match.surveys.sketch_area,
        gps_location: match.surveys.gps_location,
        polygon_boundary: match.surveys.polygon_boundary,
        boundary_w_val: match.surveys.boundary_w_val,
        boundary_w_neighbor: match.surveys.boundary_w_neighbor,
        boundary_b_val: match.surveys.boundary_b_val,
        boundary_b_neighbor: match.surveys.boundary_b_neighbor,
        boundary_k_val: match.surveys.boundary_k_val,
        boundary_k_neighbor: match.surveys.boundary_k_neighbor,
        boundary_g_val: match.surveys.boundary_g_val,
        boundary_g_neighbor: match.surveys.boundary_g_neighbor,
      } : null;
      return NextResponse.json({ reference: {
        ref_number: match.ref_number, subject: match.subject, issue_date: match.issue_date,
        archive_drive_file_id: null, archive_file_name: null, surveys: survey, source: 'sheet',
      } }, { headers: publicReferenceHeaders });
    }
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

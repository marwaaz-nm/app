import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';

const requiredText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req, 'survey.create');
    const body = await req.json();
    const ownerName = requiredText(body.owner_name);
    const neighborhood = requiredText(body.neighborhood);
    const branch = requiredText(body.branch);
    const landType = requiredText(body.land_type);
    const polygonBoundary = requiredText(body.polygon_boundary);

    if (!ownerName || !neighborhood || !branch || !landType) {
      return NextResponse.json({ error: 'Owner, neighborhood, branch and land type are required.' }, { status: 400 });
    }

    // Drawing a parcel is optional for draft registration. When coordinates are
    // supplied, retain the full geometry validation and overlap protection.
    if (polygonBoundary) {
      const { data: polygonIsValid, error: polygonError } = await viewer.admin.rpc('is_survey_polygon_valid', {
        poly_text: polygonBoundary,
      });
      if (polygonError) throw polygonError;
      if (!polygonIsValid) return NextResponse.json({ error: 'The polygon coordinates are invalid.' }, { status: 400 });

      const { data: overlaps, error: overlapError } = await viewer.admin.rpc('check_survey_overlap', {
        poly_text: polygonBoundary,
        exclude_survey_id: null,
      });
      if (overlapError) throw overlapError;
      if (Array.isArray(overlaps) && overlaps.length > 0) {
        return NextResponse.json({
          error: 'This parcel overlaps an existing survey.',
          overlaps,
        }, { status: 409 });
      }
    }

    const { data: surveyNo, error: surveyNoError } = await viewer.admin.rpc('next_survey_number');
    if (surveyNoError) throw surveyNoError;

    const payload = {
      owner_name: ownerName,
      neighborhood,
      branch,
      vicinity: requiredText(body.vicinity) || null,
      land_type: landType,
      built_details: requiredText(body.built_details) || null,
      boundary_w_val: requiredText(body.boundary_w_val) || null,
      boundary_w_neighbor: requiredText(body.boundary_w_neighbor) || null,
      boundary_b_val: requiredText(body.boundary_b_val) || null,
      boundary_b_neighbor: requiredText(body.boundary_b_neighbor) || null,
      boundary_k_val: requiredText(body.boundary_k_val) || null,
      boundary_k_neighbor: requiredText(body.boundary_k_neighbor) || null,
      boundary_g_val: requiredText(body.boundary_g_val) || null,
      boundary_g_neighbor: requiredText(body.boundary_g_neighbor) || null,
      gps_location: requiredText(body.gps_location) || null,
      polygon_boundary: polygonBoundary || null,
      sketch_area: requiredText(body.sketch_area) || null,
      sketch_dimensions: requiredText(body.sketch_dimensions) || null,
      boundary_label_positions: requiredText(body.boundary_label_positions) || null,
      survey_no: surveyNo || null,
      status: 'Draft',
      created_by: viewer.userId,
      updated_by: viewer.userId,
    };

    const { data, error } = await viewer.admin.from('surveys').insert(payload).select('*').single();
    if (error) throw error;
    return NextResponse.json({ survey: data }, { status: 201 });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

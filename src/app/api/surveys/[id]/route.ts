import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer, type RequestViewer } from '@/lib/server-auth';
import type { SurveyStatus } from '@/types';

const editableFields = [
  'owner_name', 'neighborhood', 'branch', 'vicinity', 'land_type', 'built_details',
  'boundary_w_val', 'boundary_w_neighbor', 'boundary_b_val', 'boundary_b_neighbor',
  'boundary_k_val', 'boundary_k_neighbor', 'boundary_g_val', 'boundary_g_neighbor',
  'gps_location', 'polygon_boundary', 'sketch_area', 'sketch_dimensions', 'boundary_label_positions',
] as const;

type RouteContext = { params: Promise<{ id: string }> };

async function getSurvey(viewer: RequestViewer, id: number) {
  const { data, error } = await viewer.admin.from('surveys').select('*').eq('id', id).single();
  if (error || !data) throw Object.assign(new Error('Survey not found.'), { status: 404 });
  return data;
}

async function requireAction(req: NextRequest, action: string) {
  return requireViewer(req, action);
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const viewer = await requireViewer(req);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid survey id.' }, { status: 400 });

    const survey = await getSurvey(viewer, id);
    const [{ data: revisions, error: revisionError }, { data: documents, error: documentError }] = await Promise.all([
      viewer.admin.from('survey_revisions').select('*').eq('survey_id', id).order('created_at', { ascending: false }),
      viewer.admin.from('survey_documents').select('*').eq('survey_id', id).order('created_at', { ascending: false }),
    ]);
    if (revisionError) throw revisionError;
    if (documentError) throw documentError;

    const documentsWithUrls = await Promise.all((documents || []).map(async (document) => {
      const { data } = await viewer.admin.storage.from('survey-documents').createSignedUrl(document.storage_path, 3600);
      return { ...document, signed_url: data?.signedUrl || null };
    }));

    return NextResponse.json({ survey, revisions: revisions || [], documents: documentsWithUrls });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action : 'update';
    const permission = ['approve', 'reject'].includes(action)
      ? 'survey.approve'
      : action === 'archive' ? 'survey.archive' : action === 'submit' ? 'survey.submit' : 'survey.edit';
    const viewer = await requireAction(req, permission);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid survey id.' }, { status: 400 });

    const survey = await getSurvey(viewer, id);
    let changes: Record<string, unknown> = { updated_by: viewer.userId };

    if (action === 'update') {
      if (!['Draft', 'Rejected'].includes(survey.status) && viewer.role !== 'Admin') {
        return NextResponse.json({ error: 'Only Draft or Rejected surveys can be edited.' }, { status: 409 });
      }
      for (const field of editableFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          changes[field] = typeof body[field] === 'string' ? body[field].trim() || null : body[field];
        }
      }
      const nextSurvey = { ...survey, ...changes };
      if (!nextSurvey.owner_name || !nextSurvey.neighborhood || !nextSurvey.branch || !nextSurvey.land_type) {
        return NextResponse.json({ error: 'Owner, neighborhood, branch and land type are required.' }, { status: 400 });
      }
      if (typeof changes.polygon_boundary === 'string') {
        const { data: polygonIsValid, error: polygonError } = await viewer.admin.rpc('is_survey_polygon_valid', {
          poly_text: changes.polygon_boundary,
        });
        if (polygonError) throw polygonError;
        if (!polygonIsValid) return NextResponse.json({ error: 'The polygon coordinates are invalid.' }, { status: 400 });
        const { data: overlaps, error: overlapError } = await viewer.admin.rpc('check_survey_overlap', {
          poly_text: changes.polygon_boundary,
          exclude_survey_id: id,
        });
        if (overlapError) throw overlapError;
        if (Array.isArray(overlaps) && overlaps.length) {
          return NextResponse.json({ error: 'This parcel overlaps an existing survey.', overlaps }, { status: 409 });
        }
      }
    } else if (action === 'submit') {
      if (!['Draft', 'Rejected'].includes(survey.status)) {
        return NextResponse.json({ error: 'Only Draft or Rejected surveys can be submitted.' }, { status: 409 });
      }
      changes = { ...changes, status: 'Pending Review', rejection_reason: null };
    } else if (action === 'approve') {
      if (survey.status !== 'Pending Review') {
        return NextResponse.json({ error: 'Only surveys pending review can be approved.' }, { status: 409 });
      }
      changes = { ...changes, status: 'Approved', approved_at: new Date().toISOString(), approved_by: viewer.userId, rejection_reason: null };
    } else if (action === 'reject') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (survey.status !== 'Pending Review') {
        return NextResponse.json({ error: 'Only surveys pending review can be rejected.' }, { status: 409 });
      }
      if (!reason) return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
      changes = { ...changes, status: 'Rejected', rejection_reason: reason, approved_at: null, approved_by: null };
    } else if (action === 'archive') {
      if (survey.status !== 'Approved') {
        return NextResponse.json({ error: 'Only approved surveys can be archived.' }, { status: 409 });
      }
      changes = { ...changes, status: 'Archived' };
    } else if (action === 'restore_revision') {
      const revisionId = Number(body.revision_id);
      const { data: revision, error } = await viewer.admin
        .from('survey_revisions').select('survey_snapshot').eq('id', revisionId).eq('survey_id', id).single();
      if (error || !revision) return NextResponse.json({ error: 'Revision not found.' }, { status: 404 });
      const snapshot = revision.survey_snapshot as Record<string, unknown>;
      for (const field of editableFields) if (field in snapshot) changes[field] = snapshot[field];
      changes = { ...changes, status: 'Draft' satisfies SurveyStatus, approved_at: null, approved_by: null, rejection_reason: null };
    } else {
      return NextResponse.json({ error: 'Unsupported survey action.' }, { status: 400 });
    }

    if (Object.keys(changes).length === 1) return NextResponse.json({ error: 'No changes supplied.' }, { status: 400 });
    const { data, error } = await viewer.admin.from('surveys').update(changes).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ survey: data });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

// Permanently deletes a survey — restricted to Admin (stricter than every other action
// on this route) since it's the one operation here with no undo, unlike restore_revision.
// survey_revisions/survey_documents rows cascade-delete via their FK, but the actual
// uploaded files in Storage don't, so those are cleaned up first, best-effort.
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.role !== 'Admin') {
      return NextResponse.json({ error: 'Kaliya Admin ayaa survey-ga tirtiri kara.' }, { status: 403 });
    }
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid survey id.' }, { status: 400 });

    await getSurvey(viewer, id);

    const { data: documents } = await viewer.admin.from('survey_documents').select('storage_path').eq('survey_id', id);
    const { data: deleted, error } = await viewer.admin.from('surveys').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!deleted) return NextResponse.json({ error: 'Survey-ga lama helin.' }, { status: 404 });
    // Never remove attachments before the database confirms deletion.
    if (documents && documents.length > 0) {
      try {
        await viewer.admin.storage.from('survey-documents').remove(documents.map((d) => d.storage_path));
      } catch (cleanupError) { console.error('Survey attachment cleanup failed:', cleanupError); }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

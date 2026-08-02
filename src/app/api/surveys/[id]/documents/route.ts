import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';

type RouteContext = { params: Promise<{ id: string }> };
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120);
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const viewer = await requireViewer(req, 'survey.edit');
    const surveyId = Number((await context.params).id);
    if (!Number.isInteger(surveyId)) return NextResponse.json({ error: 'Invalid survey id.' }, { status: 400 });

    const { data: survey } = await viewer.admin.from('surveys').select('id').eq('id', surveyId).single();
    if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 });

    const form = await req.formData();
    const file = form.get('file');
    const category = String(form.get('category') || 'Other').trim().slice(0, 60) || 'Other';
    if (!(file instanceof File)) return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: 'Only PDF, JPG, PNG and WebP files are allowed.' }, { status: 415 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File size must not exceed 10 MB.' }, { status: 413 });

    const storagePath = `${surveyId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await viewer.admin.storage
      .from('survey-documents').upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await viewer.admin.from('survey_documents').insert({
      survey_id: surveyId,
      name: file.name.slice(0, 255),
      category,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: viewer.userId,
    }).select('*').single();
    if (error) {
      await viewer.admin.storage.from('survey-documents').remove([storagePath]);
      throw error;
    }
    const { data: signed } = await viewer.admin.storage.from('survey-documents').createSignedUrl(storagePath, 3600);
    return NextResponse.json({ document: { ...data, signed_url: signed?.signedUrl || null } }, { status: 201 });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const viewer = await requireViewer(req, 'survey.edit');
    const surveyId = Number((await context.params).id);
    const documentId = Number(req.nextUrl.searchParams.get('documentId'));
    if (!Number.isInteger(surveyId) || !Number.isInteger(documentId)) {
      return NextResponse.json({ error: 'Invalid survey or document id.' }, { status: 400 });
    }
    const { data: document, error } = await viewer.admin.from('survey_documents')
      .select('storage_path').eq('id', documentId).eq('survey_id', surveyId).single();
    if (error || !document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

    const { error: storageError } = await viewer.admin.storage.from('survey-documents').remove([document.storage_path]);
    if (storageError) throw storageError;
    const { error: deleteError } = await viewer.admin.from('survey_documents').delete().eq('id', documentId).eq('survey_id', surveyId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

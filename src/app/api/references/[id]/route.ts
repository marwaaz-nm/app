import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getArchiveDriveConfig } from '@/lib/archiveDriveConfig';
import { deleteArchiveFile } from '@/lib/driveArchive';

type RouteContext = { params: Promise<{ id: string }> };

// Deletes a reference and, best-effort, its archived PDF (if one was ever attached via
// Document Archive) — a plain client-side `.delete()` couldn't reach the archive
// script's shared secret to clean that file up, so this goes through an API route
// instead of the direct-Supabase-client pattern the rest of this page otherwise uses.
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const viewer = await requireViewer(req);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid reference id.' }, { status: 400 });

    const { data: reference, error: fetchError } = await viewer.admin
      .from('references')
      .select('id, archive_drive_file_id')
      .eq('id', id)
      .single();
    if (fetchError || !reference) return NextResponse.json({ error: 'Reference-ka lama helin.' }, { status: 404 });

    const { error: deleteError } = await viewer.admin.from('references').delete().eq('id', id);
    if (deleteError) throw deleteError;

    if (reference.archive_drive_file_id) {
      try {
        const config = await getArchiveDriveConfig(viewer.admin);
        await deleteArchiveFile(config, reference.archive_drive_file_id);
      } catch {
        // Document Archive may not be configured, or the file may already be gone —
        // the reference row is already deleted either way.
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

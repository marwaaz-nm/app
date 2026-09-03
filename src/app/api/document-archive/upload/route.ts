import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getArchiveDriveConfig } from '@/lib/archiveDriveConfig';
import { deleteArchiveFile, uploadArchivePdf } from '@/lib/driveArchive';

// Real scans should compress down well under this — kept tight so the archive stays
// cheap to store and fast to open over a weak connection.
const MAX_SIZE = 1 * 1024 * 1024;

// Uploads (or replaces) the scanned PDF for one reference. Any authenticated user who
// can reach the Document Archive menu may upload — same access level as creating a
// reference in the first place, not restricted to Admin.
export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req, 'archive.upload');

    const form = await req.formData();
    const file = form.get('file');
    const referenceId = Number(form.get('referenceId'));
    if (!Number.isFinite(referenceId)) return NextResponse.json({ error: 'referenceId waa loo baahan yahay.' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'Fayl PDF ah waa loo baahan yahay.' }, { status: 400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Kaliya faylasha PDF ayaa la ogol yahay.' }, { status: 415 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Faylku waa inuusan ka weynayn 1 MB.' }, { status: 413 });

    const { data: reference, error: refError } = await viewer.admin
      .from('references')
      .select('id, ref_number, archive_drive_file_id')
      .eq('id', referenceId)
      .single();
    if (refError || !reference) return NextResponse.json({ error: 'Reference-ka lama helin.' }, { status: 404 });

    const config = await getArchiveDriveConfig(viewer.admin);
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${reference.ref_number} - ${file.name}`;
    const uploaded = await uploadArchivePdf(config, fileName, buffer);

    const { error: updateError } = await viewer.admin
      .from('references')
      .update({
        archive_drive_file_id: uploaded.fileId,
        archive_file_name: fileName,
        archive_uploaded_at: new Date().toISOString(),
        archive_uploaded_by: viewer.userId,
      })
      .eq('id', referenceId);
    if (updateError) {
      await deleteArchiveFile(config, uploaded.fileId);
      throw updateError;
    }

    if (reference.archive_drive_file_id) {
      await deleteArchiveFile(config, reference.archive_drive_file_id);
    }

    return NextResponse.json({ ok: true, fileName });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

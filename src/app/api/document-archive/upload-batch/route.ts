import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getArchiveDriveConfig } from '@/lib/archiveDriveConfig';
import { deleteArchiveFile, uploadArchivePdf } from '@/lib/driveArchive';

// Real scans should compress down well under this — kept tight so the archive stays
// cheap to store and fast to open over a weak connection.
const MAX_SIZE = 1 * 1024 * 1024;

// Attaches one uploaded PDF to several references at once (e.g. a single contract that
// covers multiple parcels) instead of re-uploading the same file per reference. Uploads
// to Drive exactly once, then links every selected reference row to that same file.
export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);

    const form = await req.formData();
    const file = form.get('file');
    const idsRaw = form.get('referenceIds');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Fayl PDF ah waa loo baahan yahay.' }, { status: 400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Kaliya faylasha PDF ayaa la ogol yahay.' }, { status: 415 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Faylku waa inuusan ka weynayn 1 MB.' }, { status: 413 });

    let referenceIds: number[] = [];
    try {
      const parsed = JSON.parse(String(idsRaw));
      if (Array.isArray(parsed)) referenceIds = parsed.map(Number).filter(Number.isFinite);
    } catch {
      // handled by the empty-array check below
    }
    if (referenceIds.length === 0) return NextResponse.json({ error: 'Fadlan dooro ugu yaraan hal reference.' }, { status: 400 });

    const { data: references, error: refError } = await viewer.admin
      .from('references')
      .select('id, ref_number, archive_drive_file_id')
      .in('id', referenceIds);
    if (refError) throw refError;
    if (!references || references.length === 0) return NextResponse.json({ error: 'References-ka lama helin.' }, { status: 404 });

    const config = await getArchiveDriveConfig(viewer.admin);
    const buffer = Buffer.from(await file.arrayBuffer());
    const refNumbers = references.map((r) => r.ref_number).join(', ');
    const fileName = references.length === 1
      ? `${references[0].ref_number} - ${file.name}`
      : `${refNumbers} - ${file.name}`;
    const uploaded = await uploadArchivePdf(config, fileName, buffer);
    const uploadedAt = new Date().toISOString();

    const { error: updateError } = await viewer.admin
      .from('references')
      .update({
        archive_drive_file_id: uploaded.fileId,
        archive_file_name: fileName,
        archive_uploaded_at: uploadedAt,
        archive_uploaded_by: viewer.userId,
      })
      .in('id', referenceIds);
    if (updateError) {
      await deleteArchiveFile(config, uploaded.fileId);
      throw updateError;
    }

    // Clean up whatever each reference used to point at — dedup so a file shared by
    // multiple of the selected references isn't deleted more than once (best effort;
    // failures here don't affect the new upload, already saved above).
    const oldFileIds = new Set(
      references.map((r) => r.archive_drive_file_id).filter((id): id is string => Boolean(id) && id !== uploaded.fileId),
    );
    await Promise.all([...oldFileIds].map((id) => deleteArchiveFile(config, id)));

    return NextResponse.json({ ok: true, fileName, linkedCount: referenceIds.length });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

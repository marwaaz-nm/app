import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPublicReferenceCode } from '@/lib/publicReferenceCode';
import { authorizePublicReference, publicReferenceError, publicReferenceHeaders } from '@/lib/publicReferenceAccess';
import { getArchiveDriveConfig } from '@/lib/archiveDriveConfig';
import { downloadArchivePdf } from '@/lib/driveArchive';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const getAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Role Key is missing in environment variables.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });
};

function contentDisposition(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// Only possession of the stored random token authorizes a public download.
async function findReference(admin: ReturnType<typeof getAdminClient>, id: string) {
  const { data, error } = await admin.from('references')
    .select('id, archive_drive_file_id, archive_file_name')
    .eq('verification_token', id.toLowerCase()).maybeSingle();
  if (error) throw new Error('Reference lookup unavailable');
  return data;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPublicReferenceCode(id)) return publicReferenceError('Reference not found', 404);

  try {
    const admin = getAdminClient();
    const denied = await authorizePublicReference(admin, id);
    if (denied) return denied;
    const reference = await findReference(admin, id);
    if (!reference) return publicReferenceError('Reference not found', 404);
    if (!reference.archive_drive_file_id) return publicReferenceError('Document not found', 404);

    const config = await getArchiveDriveConfig(admin);
    const buffer = await downloadArchivePdf(config, reference.archive_drive_file_id);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(reference.archive_file_name || 'document.pdf'),
        ...publicReferenceHeaders,
      },
    });
  } catch {
    console.error('Public document download failed');
    return publicReferenceError('Service temporarily unavailable', 503);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseAndVerifyToken } from '@/lib/verificationToken';
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

// Same unauthenticated, IDOR-safe lookup as /api/public/references/[id] (signed token,
// then verification_token UUID, then legacy numeric id) — this route is reached by
// scanning a printed QR code, so it can't require a login.
async function findReference(admin: ReturnType<typeof getAdminClient>, id: string) {
  const fields = 'id, archive_drive_file_id, archive_file_name';

  const signedRefId = parseAndVerifyToken(id);
  if (signedRefId) {
    const { data } = await admin.from('references').select(fields).eq('id', signedRefId).maybeSingle();
    if (data) return data;
  }

  const { data: byToken } = await admin.from('references').select(fields).eq('verification_token', id).maybeSingle();
  if (byToken) return byToken;

  if (/^\d+$/.test(id)) {
    const { data: byId } = await admin.from('references').select(fields).eq('id', parseInt(id, 10)).maybeSingle();
    if (byId) return byId;
  }

  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing reference identifier' }, { status: 400 });

  try {
    const admin = getAdminClient();
    const reference = await findReference(admin, id);
    if (!reference) return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
    if (!reference.archive_drive_file_id) return NextResponse.json({ error: 'No document archived for this reference.' }, { status: 404 });

    const config = await getArchiveDriveConfig(admin);
    const buffer = await downloadArchivePdf(config, reference.archive_drive_file_id);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(reference.archive_file_name || 'document.pdf'),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Error downloading archived reference document:', err);
    // getArchiveDriveConfig() throws a 503 with a specific "not configured yet"
    // message when Document Archive hasn't been set up in Settings — that got
    // collapsed into a generic, unhelpful "Server error" here before, making a
    // perfectly diagnosable setup problem look like a broken download link.
    const status = typeof err === 'object' && err && 'status' in err
      ? Number((err as { status: unknown }).status)
      : 500;
    const resolvedStatus = Number.isFinite(status) && status >= 400 && status < 600 ? status : 500;
    const message = resolvedStatus < 500 && err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: resolvedStatus });
  }
}

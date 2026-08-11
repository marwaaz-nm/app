import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { downloadFile } from '@/lib/googleDrive';
import { getDriveConnection } from '@/lib/driveConnections';

function contentDisposition(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(req: NextRequest) {
  try {
    await requireViewer(req);
    const fileId = req.nextUrl.searchParams.get('fileId')?.trim();
    if (!fileId) throw Object.assign(new Error('fileId waa loo baahan yahay.'), { status: 400 });
    const connectionId = Number(req.nextUrl.searchParams.get('connectionId'));
    if (!Number.isFinite(connectionId)) {
      return NextResponse.json({ error: 'connectionId waa loo baahan yahay.' }, { status: 400 });
    }
    const conn = await getDriveConnection(getDriveAdminClient(), connectionId);

    const { buffer, name, mimeType } = await downloadFile(conn, fileId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': contentDisposition(name),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

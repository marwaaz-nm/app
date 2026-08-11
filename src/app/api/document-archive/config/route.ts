import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getArchiveDriveConfigSummary, setArchiveDriveConfig } from '@/lib/archiveDriveConfig';

export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.role !== 'Admin') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    const summary = await getArchiveDriveConfigSummary(viewer.admin);
    return NextResponse.json({ config: summary });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.role !== 'Admin') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });

    const body = await req.json();
    const scriptUrl = typeof body?.scriptUrl === 'string' ? body.scriptUrl.trim() : '';
    const sharedSecret = typeof body?.sharedSecret === 'string' ? body.sharedSecret.trim() : '';
    const rootFolderId = typeof body?.rootFolderId === 'string' ? body.rootFolderId.trim() : '';
    if (!scriptUrl || !sharedSecret || !rootFolderId) {
      return NextResponse.json({ error: 'Fadlan buuxi Script URL-ka, secret-ka, iyo folder ID-ga.' }, { status: 400 });
    }

    await setArchiveDriveConfig(viewer.admin, { scriptUrl, sharedSecret, rootFolderId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

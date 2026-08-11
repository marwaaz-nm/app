import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer, DRIVE_CONNECTIONS_MANAGER_USERNAME } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { getDriveConnection } from '@/lib/driveConnections';
import { getWatchStatus, registerWatch } from '@/lib/driveWatch';

function parseId(idParam: string): number {
  const id = Number(idParam);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Xidhiidh sax ah lama helin.'), { status: 400 });
  return id;
}

// Registers (or renews) this connection's Drive push-notification channel so new/changed
// documents get indexed within seconds instead of waiting for a manual "Sync Now".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.username !== DRIVE_CONNECTIONS_MANAGER_USERNAME) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }
    const baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: 'APP_BASE_URL lama dejin. Admin-ka: ku dar .env.local iyo Vercel environment variables.' }, { status: 503 });
    }

    const { id: idParam } = await params;
    const id = parseId(idParam);
    const driveAdmin = getDriveAdminClient();
    const conn = await getDriveConnection(driveAdmin, id);

    const { data: existingRow } = await driveAdmin
      .from('drive_connections')
      .select('watch_channel_id, watch_resource_id, watch_page_token')
      .eq('id', id)
      .single();

    const { expiresAt } = await registerWatch(driveAdmin, id, conn, baseUrl, existingRow
      ? { channelId: existingRow.watch_channel_id, resourceId: existingRow.watch_resource_id, pageToken: existingRow.watch_page_token }
      : undefined);

    return NextResponse.json({ status: { active: true, expiresAt } });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.username !== DRIVE_CONNECTIONS_MANAGER_USERNAME) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }
    const { id: idParam } = await params;
    const id = parseId(idParam);
    const status = await getWatchStatus(getDriveAdminClient(), id);
    return NextResponse.json({ status });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

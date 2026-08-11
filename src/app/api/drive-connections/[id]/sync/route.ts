import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer, DRIVE_CONNECTIONS_MANAGER_USERNAME } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { getDriveConnection } from '@/lib/driveConnections';
import { syncConnectionIndex } from '@/lib/driveIndexSync';
import { getIndexStatus } from '@/lib/driveIndex';

function parseId(idParam: string): number {
  const id = Number(idParam);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Xidhiidh sax ah lama helin.'), { status: 400 });
  return id;
}

// Runs one time-boxed batch of the index sync and reports progress. The client calls
// this repeatedly until progress.done is true, so a large document set doesn't need to
// fit inside a single request's execution time limit.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.username !== DRIVE_CONNECTIONS_MANAGER_USERNAME) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }
    const { id: idParam } = await params;
    const id = parseId(idParam);
    const driveAdmin = getDriveAdminClient();
    const conn = await getDriveConnection(driveAdmin, id);
    const progress = await syncConnectionIndex(driveAdmin, conn, id);
    return NextResponse.json({ progress });
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
    const status = await getIndexStatus(getDriveAdminClient(), id);
    return NextResponse.json({ status });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

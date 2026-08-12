import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { getDriveConnection } from '@/lib/driveConnections';
import { getStorageQuota } from '@/lib/googleDrive';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireViewer(req);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid connection id.' }, { status: 400 });

    const conn = await getDriveConnection(getDriveAdminClient(), id);
    const quota = await getStorageQuota(conn);
    return NextResponse.json(quota);
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

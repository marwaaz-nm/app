import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { browseFolder, getFolderPath, searchWordFiles } from '@/lib/googleDrive';
import { getDriveConnection } from '@/lib/driveConnections';

export async function GET(req: NextRequest) {
  try {
    await requireViewer(req);
    const connectionId = Number(req.nextUrl.searchParams.get('connectionId'));
    if (!Number.isFinite(connectionId)) {
      return NextResponse.json({ error: 'connectionId waa loo baahan yahay.' }, { status: 400 });
    }
    const conn = await getDriveConnection(getDriveAdminClient(), connectionId);
    const query = req.nextUrl.searchParams.get('q')?.trim();

    if (query) {
      const items = await searchWordFiles(conn, query);
      return NextResponse.json({ mode: 'search', query, items });
    }

    const folderId = req.nextUrl.searchParams.get('folderId')?.trim() || conn.rootFolderId;
    const [items, path] = await Promise.all([
      browseFolder(conn, folderId),
      getFolderPath(conn, folderId),
    ]);
    return NextResponse.json({ mode: 'browse', folderId, path, items });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

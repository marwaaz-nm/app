import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { browseFolder, getFolderPath, getRootFolderId, searchWordFiles } from '@/lib/googleDrive';

export async function GET(req: NextRequest) {
  try {
    await requireViewer(req);
    const rootId = getRootFolderId();
    const query = req.nextUrl.searchParams.get('q')?.trim();

    if (query) {
      const items = await searchWordFiles(rootId, query);
      return NextResponse.json({ mode: 'search', query, items });
    }

    const folderId = req.nextUrl.searchParams.get('folderId')?.trim() || rootId;
    const [items, path] = await Promise.all([
      browseFolder(folderId),
      getFolderPath(folderId, rootId),
    ]);
    return NextResponse.json({ mode: 'browse', folderId, path, items });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

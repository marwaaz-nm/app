import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { searchCustomers } from '@/lib/customerSearch';
import { getAllActiveDriveConnections, listDriveConnectionSummaries } from '@/lib/driveConnections';

export async function GET(req: NextRequest) {
  try {
    await requireViewer(req);
    const query = req.nextUrl.searchParams.get('q')?.trim();
    if (!query) return NextResponse.json({ query: '', results: [] });

    const driveAdmin = getDriveAdminClient();
    const [connections, summaries] = await Promise.all([
      getAllActiveDriveConnections(driveAdmin),
      listDriveConnectionSummaries(driveAdmin),
    ]);
    const nameById = new Map(summaries.map((s) => [s.id, s.name]));
    const withNames = connections.map((conn) => ({ conn, name: nameById.get(conn.id) || 'Drive' }));

    const results = await searchCustomers(driveAdmin, withNames, query);
    return NextResponse.json({ query, results });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

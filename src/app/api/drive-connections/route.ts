import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer, DRIVE_CONNECTIONS_MANAGER_USERNAME } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { createDriveConnection, listDriveConnectionSummaries, listDriveConnectionsFull } from '@/lib/driveConnections';

export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    const driveAdmin = getDriveAdminClient();
    // Any user who can reach the Drive menus needs the name list to pick from; only
    // the designated connections manager needs the credential-adjacent details
    // (folder id/created date) used to manage connections in Settings.
    if (viewer.role === 'Admin' && viewer.username === DRIVE_CONNECTIONS_MANAGER_USERNAME) {
      const connections = await listDriveConnectionsFull(driveAdmin);
      return NextResponse.json({ connections });
    }
    const connections = await listDriveConnectionSummaries(driveAdmin);
    return NextResponse.json({ connections });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.username !== DRIVE_CONNECTIONS_MANAGER_USERNAME) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const clientEmail = typeof body?.clientEmail === 'string' ? body.clientEmail.trim() : '';
    const privateKey = typeof body?.privateKey === 'string' ? body.privateKey.trim() : '';
    const rootFolderId = typeof body?.rootFolderId === 'string' ? body.rootFolderId.trim() : '';
    if (!name || !clientEmail || !privateKey || !rootFolderId) {
      return NextResponse.json({ error: 'Fadlan buuxi magaca, email-ka service account-ka, furaha sirta ah, iyo folder ID-ga.' }, { status: 400 });
    }

    const connection = await createDriveConnection(getDriveAdminClient(), { name, clientEmail, privateKey, rootFolderId });
    return NextResponse.json({ connection });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

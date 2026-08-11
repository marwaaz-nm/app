import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer, DRIVE_CONNECTIONS_MANAGER_USERNAME } from '@/lib/server-auth';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { deleteDriveConnection, updateDriveConnection } from '@/lib/driveConnections';

function parseId(idParam: string): number {
  const id = Number(idParam);
  if (!Number.isFinite(id)) throw Object.assign(new Error('Xidhiidh sax ah lama helin.'), { status: 400 });
  return id;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.username !== DRIVE_CONNECTIONS_MANAGER_USERNAME) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const { id: idParam } = await params;
    const id = parseId(idParam);
    const body = await req.json();

    const patch: { name?: string; clientEmail?: string; privateKey?: string; rootFolderId?: string; isActive?: boolean } = {};
    if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body?.clientEmail === 'string' && body.clientEmail.trim()) patch.clientEmail = body.clientEmail.trim();
    if (typeof body?.privateKey === 'string' && body.privateKey.trim()) patch.privateKey = body.privateKey.trim();
    if (typeof body?.rootFolderId === 'string' && body.rootFolderId.trim()) patch.rootFolderId = body.rootFolderId.trim();
    if (typeof body?.isActive === 'boolean') patch.isActive = body.isActive;

    await updateDriveConnection(getDriveAdminClient(), id, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.username !== DRIVE_CONNECTIONS_MANAGER_USERNAME) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const { id: idParam } = await params;
    const id = parseId(idParam);
    await deleteDriveConnection(getDriveAdminClient(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

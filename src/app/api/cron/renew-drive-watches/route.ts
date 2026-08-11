import { NextRequest, NextResponse } from 'next/server';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { listConnectionsNeedingWatchRenewal, registerWatch } from '@/lib/driveWatch';

// Google Drive push-notification channels expire after at most 7 days, so this renews
// any connection's channel that's missing or expiring soon. Triggered daily by Vercel
// Cron (see vercel.json) — renewing anything within 48h of expiry leaves comfortable
// margin even if a run is ever delayed.
const RENEWAL_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: 'APP_BASE_URL is not configured.' }, { status: 503 });
  }

  const driveAdmin = getDriveAdminClient();
  const candidates = await listConnectionsNeedingWatchRenewal(driveAdmin, RENEWAL_WINDOW_MS);

  const results = await Promise.all(candidates.map(async (c) => {
    try {
      const { expiresAt } = await registerWatch(driveAdmin, c.connectionId, c.conn, baseUrl, {
        channelId: c.oldChannelId,
        resourceId: c.oldResourceId,
        pageToken: c.pageToken,
      });
      return { connectionId: c.connectionId, ok: true, expiresAt };
    } catch (error) {
      return { connectionId: c.connectionId, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));

  return NextResponse.json({ renewed: results });
}

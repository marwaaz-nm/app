import { NextRequest, NextResponse } from 'next/server';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import { findConnectionByChannelId, processDriveChanges } from '@/lib/driveWatch';

// Google Drive's push-notification endpoint for every connection's watch channel. This
// is publicly reachable by design (Drive can't send our normal Supabase session bearer
// token) — the X-Goog-Channel-Token header, a random secret generated when the channel
// was registered (see registerWatch in driveWatch.ts) and echoed back on every
// notification, is what actually authenticates the request. A request with a missing or
// wrong token is silently ignored (still 200, so Google doesn't retry) rather than
// distinguished with a different status code, so it can't be used to probe which channel
// ids exist.
export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id');
  const channelToken = req.headers.get('x-goog-channel-token');
  const resourceState = req.headers.get('x-goog-resource-state');

  if (!channelId) return NextResponse.json({ ok: true });
  // The "sync" state is Drive's initial handshake ping sent right after a channel is
  // created, carrying no actual changes — nothing to process yet.
  if (resourceState === 'sync') return NextResponse.json({ ok: true });

  try {
    const driveAdmin = getDriveAdminClient();
    const lookup = await findConnectionByChannelId(driveAdmin, channelId);
    if (!lookup || !lookup.channelToken || lookup.channelToken !== channelToken || !lookup.pageToken) {
      return NextResponse.json({ ok: true });
    }

    await processDriveChanges(driveAdmin, lookup.conn, lookup.connectionId, lookup.pageToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[drive-webhook]', error);
    // A transient failure (e.g. Drive/Supabase hiccup) is worth a retry from Google's
    // side, unlike the no-op cases above.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

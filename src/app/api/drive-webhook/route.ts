import { NextRequest, NextResponse } from 'next/server';
import { getDriveAdminClient } from '@/lib/driveSupabase';
import {
  claimDriveChangeProcessing,
  findConnectionByChannelId,
  finishDriveChangeProcessing,
  processDriveChanges,
  releaseDriveChangeProcessing,
} from '@/lib/driveWatch';

const MAX_DRAIN_PASSES = 3;

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

    const claim = await claimDriveChangeProcessing(driveAdmin, lookup.connectionId);
    if (!claim.acquired) return NextResponse.json({ ok: true, deduplicated: true });

    const startedAt = Date.now();
    let processed = 0;
    let removed = 0;
    let passes = 0;
    try {
      let repeat: boolean;
      do {
        // Re-read the cursor on a drain pass because the previous pass advances it.
        const current = passes === 0
          ? lookup
          : await findConnectionByChannelId(driveAdmin, channelId);
        if (!current?.pageToken) break;
        const result = await processDriveChanges(driveAdmin, current.conn, current.connectionId, current.pageToken);
        processed += result.processed;
        removed += result.removed;
        passes += 1;
        repeat = await finishDriveChangeProcessing(driveAdmin, lookup.connectionId, claim.distributed);
      } while (repeat && passes < MAX_DRAIN_PASSES);

      console.log(JSON.stringify({
        level: 'info',
        message: 'Drive webhook processed',
        connectionId: lookup.connectionId,
        processed,
        removed,
        passes,
        durationMs: Date.now() - startedAt,
      }));
      return NextResponse.json({ ok: true, processed, removed });
    } finally {
      await releaseDriveChangeProcessing(driveAdmin, lookup.connectionId, claim.distributed);
    }
  } catch (error) {
    console.error('[drive-webhook]', error);
    // A transient failure (e.g. Drive/Supabase hiccup) is worth a retry from Google's
    // side, unlike the no-op cases above.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

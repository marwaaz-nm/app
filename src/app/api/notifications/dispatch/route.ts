import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseMessaging } from '@/lib/firebaseAdmin';
import { getAdminClient } from '@/lib/server-auth';

type NotificationRecord = {
  id: number;
  recipient_id: string;
  title: string;
  body: string;
  href: string;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: NotificationRecord;
};

const secureMatch = (provided: string, expected: string) => {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.PUSH_WEBHOOK_SECRET || '';
  const providedSecret = req.headers.get('x-webhook-secret') || '';
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Push webhook is not configured.' }, { status: 503 });
  }
  if (!secureMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const payload = await req.json() as WebhookPayload;
  const record = payload.record;
  if (
    payload.type !== 'INSERT'
    || payload.schema !== 'public'
    || payload.table !== 'app_notifications'
    || !record?.recipient_id
  ) {
    return NextResponse.json({ skipped: true });
  }

  const admin = getAdminClient();
  const { data: tokenRows, error } = await admin
    .from('push_device_tokens')
    .select('token')
    .eq('recipient_id', record.recipient_id);
  if (error) throw error;
  const tokens = (tokenRows || []).map((row) => row.token).filter(Boolean).slice(0, 500);
  if (tokens.length === 0) return NextResponse.json({ sent: 0 });

  const response = await getFirebaseMessaging().sendEachForMulticast({
    tokens,
    notification: { title: record.title, body: record.body },
    data: {
      href: record.href,
      notificationId: String(record.id),
    },
    android: {
      priority: 'high',
      notification: {
        icon: 'notification_logo',
        color: '#159447',
        channelId: 'record-updates',
      },
    },
  });

  const invalidTokens = response.responses.flatMap((result, index) => {
    const code = result.error?.code || '';
    return code === 'messaging/registration-token-not-registered'
      || code === 'messaging/invalid-registration-token'
      ? [tokens[index]]
      : [];
  });
  if (invalidTokens.length > 0) {
    await admin.from('push_device_tokens').delete().in('token', invalidTokens);
  }

  return NextResponse.json({ sent: response.successCount, failed: response.failureCount });
}

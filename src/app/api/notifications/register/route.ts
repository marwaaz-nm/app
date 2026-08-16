import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    const body = await req.json() as { token?: unknown; platform?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';

    if (!token) throw Object.assign(new Error('Push token is required.'), { status: 400 });
    if (!['android', 'ios'].includes(platform)) {
      throw Object.assign(new Error('Unsupported push platform.'), { status: 400 });
    }

    const { error } = await viewer.admin.from('push_device_tokens').upsert({
      recipient_id: viewer.userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'token' });
    if (error) throw error;

    return NextResponse.json({ registered: true });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

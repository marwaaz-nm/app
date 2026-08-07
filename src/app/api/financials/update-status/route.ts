import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    const body = await req.json();

    const receiptId = body.receipt_id ? Number(body.receipt_id) : null;
    const status = body.status || 'Paid';
    const paymentDate = body.payment_date || new Date().toISOString().split('T')[0];

    if (!receiptId) {
      return NextResponse.json({ error: 'Receipt ID is required.' }, { status: 400 });
    }

    const { error } = await viewer.admin
      .from('receipts')
      .update({ status, payment_date: paymentDate })
      .eq('id', receiptId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = apiError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}

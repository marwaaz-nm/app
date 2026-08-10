import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    const body = await req.json();

    const referenceId = body.reference_id ? Number(body.reference_id) : null;
    const creditReceiptId = body.credit_receipt_id ? Number(body.credit_receipt_id) : null;
    const payAmt = Number(body.pay_amount);
    const totalCredit = Number(body.total_credit);
    const paymentMode = body.payment_mode || 'EVC Plus';
    const paymentDate = body.payment_date || new Date().toISOString().split('T')[0];
    const details = body.details || '';

    if (!creditReceiptId || isNaN(payAmt) || payAmt <= 0) {
      return NextResponse.json({ error: 'Valid payment details and credit receipt ID are required.' }, { status: 400 });
    }

    const remainingCredit = totalCredit - payAmt;

    if (remainingCredit <= 0.001) {
      // FULL PAYMENT: Update the credit receipt to Paid
      const { error: updateError } = await viewer.admin
        .from('receipts')
        .update({
          status: 'Paid',
          amount: payAmt,
          payment_mode: paymentMode,
          payment_date: paymentDate,
          details: details || 'Bixinta buuxda ee deynta'
        })
        .eq('id', creditReceiptId);

      if (updateError) throw updateError;
    } else {
      // PARTIAL PAYMENT:
      // 1. Update existing credit receipt amount to remaining credit
      const { error: updateError } = await viewer.admin
        .from('receipts')
        .update({
          amount: remainingCredit,
          details: 'Deyn harsan'
        })
        .eq('id', creditReceiptId);

      if (updateError) throw updateError;

      // 2. Insert new receipt for the paid amount
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const newReceiptNo = `REC-${randomNum}`;

      const { error: insertError } = await viewer.admin
        .from('receipts')
        .insert({
          receipt_no: newReceiptNo,
          reference_id: referenceId,
          amount: payAmt,
          status: 'Paid',
          payment_mode: paymentMode,
          payment_date: paymentDate,
          details: details || 'Bixinta qeyb ka mid ah deynta',
          created_by: viewer.userId
        });

      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, remainingCredit });
  } catch (error) {
    const err = apiError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}

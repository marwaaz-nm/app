import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';

type FinancialRecordType = 'receipt' | 'expense';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const recordType = body.type as FinancialRecordType;
    const recordId = Number(body.id);

    if (!['receipt', 'expense'].includes(recordType) || !Number.isInteger(recordId) || recordId <= 0) {
      return NextResponse.json({ error: 'Valid financial record type and ID are required.' }, { status: 400 });
    }

    const action = recordType === 'receipt' ? 'payment.delete' : 'expense.delete';
    const viewer = await requireViewer(req, action);
    if (viewer.role !== 'Admin' && viewer.permittedMenus !== null && !viewer.permittedMenus.includes('/financials')) {
      return NextResponse.json({ error: 'Financials access required.' }, { status: 403 });
    }

    if (recordType === 'receipt') {
      const { data, error } = await viewer.admin.from('receipts').delete().eq('id', recordId).select('id, amount, status').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Receipt-ka lama helin ama horay ayaa loo tirtiray.' }, { status: 404 });
      return NextResponse.json({ deleted: data });
    }

    const { data, error } = await viewer.admin.from('expenses').delete().eq('id', recordId).select('id, total').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Expense-ka lama helin ama horay ayaa loo tirtiray.' }, { status: 404 });
    return NextResponse.json({ deleted: data });
  } catch (error) {
    const err = apiError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
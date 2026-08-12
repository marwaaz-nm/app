import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer, type RequestViewer } from '@/lib/server-auth';

const hasMenu = (viewer: RequestViewer, path: string) =>
  viewer.role === 'Admin' || viewer.permittedMenus === null || viewer.permittedMenus.includes(path);

const safeQuery = (value: string) => value.replace(/[\\%_]/g, '').trim().slice(0, 80);

export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    const query = safeQuery(req.nextUrl.searchParams.get('q') || '');

    if (query.length >= 2) {
      const pattern = `%${query}%`;
      const searches: Array<PromiseLike<{ data: unknown[] | null; error: unknown }>> = [];
      if (hasMenu(viewer, '/records')) {
        searches.push(viewer.admin.from('surveys').select('id, serial_no, survey_no, owner_name, neighborhood, status').ilike('owner_name', pattern).limit(5));
        searches.push(viewer.admin.from('surveys').select('id, serial_no, survey_no, owner_name, neighborhood, status').ilike('neighborhood', pattern).limit(5));
      }
      if (hasMenu(viewer, '/references')) {
        searches.push(viewer.admin.from('references').select('id, ref_number, subject, status').ilike('subject', pattern).limit(5));
        searches.push(viewer.admin.from('references').select('id, ref_number, subject, status').ilike('ref_number', pattern).limit(5));
      }
      if (hasMenu(viewer, '/transfers')) {
        searches.push(viewer.admin.from('transfers').select('id, serial_no, seller_name, buyer_name, transfer_date').ilike('seller_name', pattern).limit(5));
        searches.push(viewer.admin.from('transfers').select('id, serial_no, seller_name, buyer_name, transfer_date').ilike('buyer_name', pattern).limit(5));
      }

      const results = await Promise.all(searches);
      const errors = results.map((result) => result.error).filter(Boolean);
      if (errors.length) throw errors[0];
      const seen = new Set<string>();
      const items = results.flatMap((result) => (result.data || []) as Array<Record<string, unknown>>).map((row) => {
        const type = 'owner_name' in row ? 'survey' : 'ref_number' in row ? 'reference' : 'transfer';
        const key = `${type}-${row.id}`;
        if (seen.has(key)) return null;
        seen.add(key);
        if (type === 'survey') return { id: key, type, title: `Survey ${row.survey_no || row.serial_no} — ${row.owner_name}`, subtitle: `${row.neighborhood} · ${row.status || 'Draft'}`, href: '/records' };
        if (type === 'reference') return { id: key, type, title: String(row.ref_number), subtitle: `${row.subject} · ${row.status}`, href: '/references' };
        return { id: key, type, title: `Transfer ${row.serial_no}`, subtitle: `${row.seller_name} → ${row.buyer_name}`, href: '/transfers' };
      }).filter(Boolean).slice(0, 10);
      return NextResponse.json({ items });
    }

    const [pendingResult, rejectedResult, referenceResult] = await Promise.all([
      hasMenu(viewer, '/records')
        ? viewer.admin.from('surveys').select('id, serial_no, survey_no, owner_name, updated_at').eq('status', 'Pending Review').order('updated_at', { ascending: false }).limit(8)
        : Promise.resolve({ data: [], error: null }),
      hasMenu(viewer, '/records')
        ? viewer.admin.from('surveys').select('id, serial_no, survey_no, owner_name, rejection_reason, updated_at').eq('status', 'Rejected').order('updated_at', { ascending: false }).limit(5)
        : Promise.resolve({ data: [], error: null }),
      hasMenu(viewer, '/references')
        ? viewer.admin.from('references').select('id, ref_number, subject, created_at').eq('status', 'In Progress').order('created_at', { ascending: true }).limit(5)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const surveySchemaMissing = [pendingResult.error, rejectedResult.error]
      .some((error) => error && 'code' in error && error.code === '42703');
    const requestError = [pendingResult.error, rejectedResult.error, referenceResult.error]
      .find((error) => error && (!('code' in error) || error.code !== '42703'));
    if (requestError) throw requestError;

    const alerts = [
      ...(surveySchemaMissing && viewer.role === 'Admin' ? [{ id: 'schema-upgrade', level: 'warning', title: 'Database upgrade ayaa loo baahan yahay', detail: 'Orod labada Supabase migration si workflow-ku u shaqeeyo.', href: '/reports', date: new Date().toISOString() }] : []),
      ...(!surveySchemaMissing ? (pendingResult.data || []).map((row) => ({ id: `pending-${row.id}`, level: 'review', title: `Survey ${row.survey_no || row.serial_no} wuxuu sugayaa ansixin`, detail: row.owner_name, href: '/records', date: row.updated_at })) : []),
      ...(!surveySchemaMissing ? (rejectedResult.data || []).map((row) => ({ id: `rejected-${row.id}`, level: 'warning', title: `Survey ${row.survey_no || row.serial_no} waa la diiday`, detail: row.rejection_reason || row.owner_name, href: '/records', date: row.updated_at })) : []),
      ...(referenceResult.data || []).map((row) => ({ id: `reference-${row.id}`, level: 'info', title: `${row.ref_number} wali wuu socdaa`, detail: row.subject, href: '/references', date: row.created_at })),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 12);

    return NextResponse.json({
      alerts,
      schemaReady: !surveySchemaMissing,
      counts: {
        pendingReview: pendingResult.data?.length || 0,
        rejected: rejectedResult.data?.length || 0,
        openReferences: referenceResult.data?.length || 0,
      },
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

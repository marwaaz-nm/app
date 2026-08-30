import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer, type RequestViewer } from '@/lib/server-auth';
import { getGoogleSheetSurveys } from '@/lib/googleSheetSurveys';
import { getGoogleSheetReferences } from '@/lib/googleSheetReferences';

const hasMenu = (viewer: RequestViewer, path: string) =>
  viewer.role === 'Admin' || viewer.permittedMenus === null || viewer.permittedMenus.includes(path);

const safeQuery = (value: string) => value.replace(/[\\%_]/g, '').trim().slice(0, 80);

export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    const query = safeQuery(req.nextUrl.searchParams.get('q') || '');

    if (query.length >= 2) {
      const pattern = `%${query}%`;
      const qLower = query.toLowerCase();
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

      const [results, sheetSurveys, sheetReferences] = await Promise.all([
        Promise.all(searches),
        hasMenu(viewer, '/records') ? getGoogleSheetSurveys().catch(() => []) : Promise.resolve([]),
        hasMenu(viewer, '/references') ? getGoogleSheetReferences().catch(() => []) : Promise.resolve([]),
      ]);

      const errors = results.map((result) => result.error).filter(Boolean);
      if (errors.length) throw errors[0];
      const seen = new Set<string>();

      const dbItems = results.flatMap((result) => (result.data || []) as Array<Record<string, unknown>>).map((row) => {
        const type = 'owner_name' in row ? 'survey' : 'ref_number' in row ? 'reference' : 'transfer';
        const key = `${type}-${row.id}`;
        if (seen.has(key)) return null;
        seen.add(key);
        if (type === 'survey') return { id: key, type, title: `Survey ${row.survey_no || row.serial_no} — ${row.owner_name}`, subtitle: `${row.neighborhood} · ${row.status || 'Draft'}`, href: '/records' };
        if (type === 'reference') return { id: key, type, title: String(row.ref_number), subtitle: `${row.subject} · ${row.status}`, href: '/references' };
        return { id: key, type, title: `Transfer ${row.serial_no}`, subtitle: `${row.seller_name} → ${row.buyer_name}`, href: '/transfers' };
      }).filter(Boolean);

      const matchingSheetItems = sheetSurveys
        .filter((s) =>
          s.owner_name.toLowerCase().includes(qLower) ||
          s.neighborhood.toLowerCase().includes(qLower) ||
          String(s.serial_no).includes(qLower) ||
          (s.survey_no && s.survey_no.toLowerCase().includes(qLower)) ||
          (s.vicinity && s.vicinity.toLowerCase().includes(qLower))
        )
        .slice(0, 5)
        .map((s) => {
          const key = `survey-${s.id}`;
          if (seen.has(key)) return null;
          seen.add(key);
          return {
            id: key,
            type: 'survey',
            title: `Survey ${s.survey_no || s.serial_no} — ${s.owner_name}`,
            subtitle: `${s.neighborhood} · ${s.status || 'Draft'}`,
            href: '/records',
          };
        })
        .filter(Boolean);

      const matchingSheetRefs = sheetReferences
        .filter((r) =>
          r.ref_number.toLowerCase().includes(qLower) ||
          r.subject.toLowerCase().includes(qLower) ||
          (r.details && r.details.toLowerCase().includes(qLower)) ||
          (r.surveys && r.surveys.owner_name.toLowerCase().includes(qLower))
        )
        .slice(0, 5)
        .map((r) => {
          const key = `reference-${r.id}`;
          if (seen.has(key)) return null;
          seen.add(key);
          return {
            id: key,
            type: 'reference',
            title: r.ref_number,
            subtitle: `${r.subject} · ${r.status}`,
            href: '/references',
          };
        })
        .filter(Boolean);

      const items = [...dbItems, ...matchingSheetItems, ...matchingSheetRefs].slice(0, 10);
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

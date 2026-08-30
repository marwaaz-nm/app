import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';
import { getGoogleSheetSurveys } from '@/lib/googleSheetSurveys';
import { getGoogleSheetReferences } from '@/lib/googleSheetReferences';

const csvCell = (value: unknown) => {
  const raw = String(value ?? '');
  const spreadsheetSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
};
const download = (body: string, name: string, contentType: string) => new NextResponse(body, {
  headers: {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  },
});

function polygonCoordinates(value: unknown) {
  if (typeof value !== 'string') return [];
  const points = value.split(';').map((point) => point.trim().split(',').map(Number)).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)).map(([lat, lng]) => [lng, lat]);
  if (points.length >= 3 && (points[0][0] !== points.at(-1)?.[0] || points[0][1] !== points.at(-1)?.[1])) points.push([...points[0]]);
  return points;
}

export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewer(req, 'report.view');
    const format = req.nextUrl.searchParams.get('format');

    // 1. CSV Format: Query both DB surveys and sheet surveys
    if (format === 'csv') {
      const [{ data: surveys, error }, sheetSurveys] = await Promise.all([
        viewer.admin
          .from('surveys')
          .select('serial_no, survey_no, owner_name, neighborhood, branch, land_type, gps_location, status, sketch_area, created_at')
          .order('created_at', { ascending: false })
          .limit(10000),
        getGoogleSheetSurveys().catch(() => []),
      ]);
      if (error) throw error;

      const dbSurveys = surveys || [];
      const existingDbSerials = new Set(dbSurveys.map((s) => s.serial_no));
      const allSurveys = [
        ...dbSurveys,
        ...sheetSurveys
          .filter((s) => !existingDbSerials.has(s.serial_no))
          .map((s) => ({
            serial_no: s.serial_no,
            survey_no: s.survey_no,
            owner_name: s.owner_name,
            neighborhood: s.neighborhood,
            branch: s.branch,
            land_type: s.land_type,
            gps_location: s.gps_location,
            status: s.status || 'Approved',
            sketch_area: s.sketch_area,
            created_at: s.created_at,
          })),
      ];

      const headers = ['Serial', 'Survey No', 'Owner', 'Neighborhood', 'Branch', 'Land Type', 'GPS', 'Status', 'Area m2', 'Created'];
      const rows = allSurveys.map((survey) => [
        survey.serial_no,
        survey.survey_no,
        survey.owner_name,
        survey.neighborhood,
        survey.branch,
        survey.land_type,
        survey.gps_location,
        survey.status,
        survey.sketch_area,
        survey.created_at,
      ]);
      return download(
        [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'),
        `marwaazpn-app-surveys-${new Date().toISOString().slice(0, 10)}.csv`,
        'text/csv; charset=utf-8'
      );
    }

    // 2. GeoJSON Format: Query surveys with parcel geometry and metadata
    if (format === 'geojson') {
      const [{ data: surveys, error }, sheetSurveys] = await Promise.all([
        viewer.admin
          .from('surveys')
          .select('id, serial_no, survey_no, owner_name, neighborhood, branch, land_type, status, sketch_area, polygon_boundary, gps_location')
          .order('created_at', { ascending: false })
          .limit(10000),
        getGoogleSheetSurveys().catch(() => []),
      ]);
      if (error) throw error;

      const dbSurveys = surveys || [];
      const existingDbSerials = new Set(dbSurveys.map((s) => s.serial_no));
      const allSurveys = [
        ...dbSurveys,
        ...sheetSurveys
          .filter((s) => !existingDbSerials.has(s.serial_no))
          .map((s) => ({
            id: s.id,
            serial_no: s.serial_no,
            survey_no: s.survey_no,
            owner_name: s.owner_name,
            neighborhood: s.neighborhood,
            branch: s.branch,
            land_type: s.land_type,
            status: s.status || 'Approved',
            sketch_area: s.sketch_area,
            polygon_boundary: s.polygon_boundary,
            gps_location: s.gps_location,
          })),
      ];

      const collection = {
        type: 'FeatureCollection',
        features: allSurveys.map((survey) => {
          const polyCoords = polygonCoordinates(survey.polygon_boundary);
          if (polyCoords.length >= 4) {
            return {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [polyCoords] },
              properties: {
                id: survey.id,
                serial_no: survey.serial_no,
                survey_no: survey.survey_no,
                owner_name: survey.owner_name,
                neighborhood: survey.neighborhood,
                branch: survey.branch,
                land_type: survey.land_type,
                status: survey.status,
                area_m2: survey.sketch_area,
              },
            };
          }
          if (survey.gps_location) {
            const [lat, lng] = survey.gps_location.split(',').map(Number);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: {
                  id: survey.id,
                  serial_no: survey.serial_no,
                  survey_no: survey.survey_no,
                  owner_name: survey.owner_name,
                  neighborhood: survey.neighborhood,
                  branch: survey.branch,
                  land_type: survey.land_type,
                  status: survey.status,
                  area_m2: survey.sketch_area,
                },
              };
            }
          }
          return null;
        }).filter(Boolean),
      };
      return download(
        JSON.stringify(collection, null, 2),
        `marwaazpn-app-parcels-${new Date().toISOString().slice(0, 10)}.geojson`,
        'application/geo+json; charset=utf-8'
      );
    }

    // 3. Backup Format: Verify Admin role first, then fetch complete tables
    if (format === 'backup') {
      if (viewer.role !== 'Admin') return NextResponse.json({ error: 'Admin access required for backups.' }, { status: 403 });

      const schemaProbe = await viewer.admin.from('surveys').select('status').limit(1);
      const schemaReady = schemaProbe.error?.code !== '42703';
      if (!schemaReady) return NextResponse.json({ error: 'Run the Supabase migrations before exporting a complete backup.' }, { status: 409 });

      const [surveyResult, referenceResult, transferResult, receiptResult, expenseResult, profileResult, revisionResult, documentResult] = await Promise.all([
        viewer.admin.from('surveys').select('*').order('created_at', { ascending: false }).limit(10000),
        viewer.admin.from('references').select('*').order('created_at', { ascending: false }).limit(10000),
        viewer.admin.from('transfers').select('*').order('created_at', { ascending: false }).limit(10000),
        viewer.admin.from('receipts').select('*').order('created_at', { ascending: false }).limit(10000),
        viewer.admin.from('expenses').select('*').order('created_at', { ascending: false }).limit(10000),
        viewer.admin.from('profiles').select('id, username, fullname, role, permitted_menus, permitted_actions, created_at'),
        viewer.admin.from('survey_revisions').select('*').order('created_at', { ascending: false }).limit(10000),
        viewer.admin.from('survey_documents').select('*').order('created_at', { ascending: false }).limit(10000),
      ]);

      const backupError = surveyResult.error || referenceResult.error || transferResult.error || receiptResult.error || expenseResult.error || profileResult.error || revisionResult.error || documentResult.error;
      if (backupError) throw backupError;

      return download(JSON.stringify({
        exported_at: new Date().toISOString(),
        version: 1,
        data: {
          profiles: profileResult.data,
          surveys: surveyResult.data,
          survey_revisions: revisionResult.data,
          survey_documents: documentResult.data,
          references: referenceResult.data,
          transfers: transferResult.data,
          receipts: receiptResult.data,
          expenses: expenseResult.data,
        },
      }, null, 2), `marwaazpn-app-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json; charset=utf-8');
    }

    // 4. Default Summary View: Fetch only lightweight projection columns and 8 recent surveys
    const [recentSurveyResult, surveyStatusesResult, referenceResult, transferResult, receiptResult, expenseResult, schemaResult, sheetSurveys, sheetReferences] = await Promise.all([
      viewer.admin.from('surveys').select('id, serial_no, survey_no, owner_name, neighborhood, status, sketch_area, created_at').order('created_at', { ascending: false }).limit(8),
      viewer.admin.from('surveys').select('status').limit(10000),
      viewer.admin.from('references').select('id, status').limit(10000),
      viewer.admin.from('transfers').select('price').limit(10000),
      viewer.admin.from('receipts').select('amount, status').limit(10000),
      viewer.admin.from('expenses').select('total').limit(10000),
      viewer.admin.from('surveys').select('status').limit(1),
      getGoogleSheetSurveys().catch(() => []),
      getGoogleSheetReferences().catch(() => []),
    ]);

    const schemaReady = schemaResult.error?.code !== '42703';
    const requestError = recentSurveyResult.error || surveyStatusesResult.error || referenceResult.error || transferResult.error || receiptResult.error || expenseResult.error || (schemaResult.error?.code === '42703' ? null : schemaResult.error);
    if (requestError) throw requestError;

    const surveyStatuses = surveyStatusesResult.data || [];
    const references = referenceResult.data || [];
    const transfers = transferResult.data || [];
    const receipts = receiptResult.data || [];
    const expenses = expenseResult.data || [];

    const totalSurveyCount = surveyStatuses.length + sheetSurveys.length;
    const totalReferenceCount = references.length + sheetReferences.length;

    const statusCounts = surveyStatuses.reduce<Record<string, number>>((counts, survey) => {
      const status = survey.status || 'Draft';
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});

    // Add sheet survey statuses (Approved)
    statusCounts['Approved'] = (statusCounts['Approved'] || 0) + sheetSurveys.length;

    const sum = (rows: Array<Record<string, unknown>>, field: string) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);

    const mergedRecentSurveys = [
      ...(recentSurveyResult.data || []),
      ...sheetSurveys.slice(0, 8).map((s) => ({
        id: s.id,
        serial_no: s.serial_no,
        survey_no: s.survey_no,
        owner_name: s.owner_name,
        neighborhood: s.neighborhood,
        status: s.status || 'Approved',
        sketch_area: s.sketch_area,
        created_at: s.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 8);

    return NextResponse.json({
      schemaReady,
      summary: {
        surveys: totalSurveyCount,
        references: totalReferenceCount,
        openReferences: references.filter((item) => item.status === 'In Progress').length,
        transfers: transfers.length,
        transferValue: sum(transfers, 'price'),
        paidIncome: sum(receipts.filter((item) => item.status === 'Paid'), 'amount'),
        outstandingCredit: sum(receipts.filter((item) => item.status === 'Credit'), 'amount'),
        expenses: sum(expenses, 'total'),
        statusCounts,
      },
      recentSurveys: mergedRecentSurveys,
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

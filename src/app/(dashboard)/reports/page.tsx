'use client';

import { useEffect, useState } from 'react';
import { Archive, BarChart3, Download, FileJson, FileSpreadsheet, FileText, Loader2, Printer, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { canAction } from '@/lib/permissions';
import { useSettings } from '@/context/SettingsContext';
import { CardLoadingSkeleton } from '@/components/Skeleton';

type ReportData = {
  schemaReady: boolean;
  period: { start: string | null; end: string | null };
  summary: { surveys: number; references: number; openReferences: number; transfers: number; transferValue: number; paidIncome: number; outstandingCredit: number; expenses: number; statusCounts: Record<string, number> };
  recentSurveys: Array<{ id: number; serial_no: number; survey_no?: string | null; owner_name: string; neighborhood: string; branch?: string; land_type?: string; creator?: string; status: string; sketch_area?: string; created_at?: string }>;
  recentReferences: Array<{ id: number; ref_number: string; subject: string; payment_status: string; status: string; creator?: string; issue_date?: string; created_at?: string }>;
  recentTransfers: Array<{ id: number; serial_no: number; seller_name: string; buyer_name: string; price: number; transfer_date: string }>;
  recentPayments: Array<{ id: number; receipt_no: string; subject?: string; amount: number; status: string; payment_mode: string; creator?: string; payment_date: string }>;
  recentExpenses: Array<{ id: number; expense_no?: string | null; description: string; total: number; creator?: string; expense_date: string }>;
  breakdowns: Record<'surveys' | 'references' | 'payments' | 'expenses', Record<string, Array<{ label: string; count: number }>>> & { surveys: Record<string, Array<{ label: string; count: number }>> & { branchGroups: Array<{ neighborhood: string; count: number; branches: Array<{ label: string; count: number }> }> } };
};
type Tab = 'surveys' | 'references' | 'payments' | 'expenses';
type ExportFormat = 'pdf' | 'csv';
type ExportSection = { id: string; label: string };

const exportSections: Record<Tab, ExportSection[]> = {
  surveys: [
    { id: 'summary', label: 'Survey Summary' }, { id: 'workflow', label: 'Workflow Status' },
    { id: 'neighborhoods', label: 'Count by Xaafadaha' }, { id: 'branches', label: 'Count by Laanta' },
    { id: 'creators', label: 'Count by Record Creator' }, { id: 'landTypes', label: 'Count by Nooca Dhulka' },
    { id: 'records', label: 'Survey Records' },
  ],
  references: [
    { id: 'summary', label: 'Reference Summary' }, { id: 'subjects', label: 'Count by Ujeedada' },
    { id: 'paymentStatuses', label: 'Count by Status' }, { id: 'workflowStatuses', label: 'Count by Workflow Status' },
    { id: 'creators', label: 'Count by Record Creator' }, { id: 'records', label: 'Reference Records' },
  ],
  payments: [
    { id: 'summary', label: 'Payment Summary' }, { id: 'subjects', label: 'Count by Ujeedo (Subject)' },
    { id: 'statuses', label: 'Count by Status / Action' }, { id: 'creators', label: 'Count by Record Creator' },
    { id: 'records', label: 'Payment Records' },
  ],
  expenses: [
    { id: 'summary', label: 'Expense Summary' }, { id: 'descriptions', label: 'Count by Description' },
    { id: 'creators', label: 'Count by Created By' }, { id: 'records', label: 'Expense Records' },
  ],
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const statusColors: Record<string, string> = { Draft: 'bg-slate-500', 'Pending Review': 'bg-amber-500', Approved: 'bg-emerald-500', Rejected: 'bg-rose-500', Archived: 'bg-violet-500' };

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Fadlan dib u gal.');
  return session.access_token;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function imageUrlToPngData(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Logo-ga lama soo qaadi karin.');
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Logo-ga lama diyaarin karin.');
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(objectUrl); }
}

function BreakdownChart({ title, items, color = 'bg-blue-500' }: { title: string; items: Array<{ label: string; count: number }>; color?: string }) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="text-xs font-black text-slate-800">{title}</h3>
    <div className="mt-4 space-y-3">{items.length ? items.map((item) => <div key={item.label}>
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-bold"><span className="truncate text-slate-600" title={item.label}>{item.label}</span><span className="shrink-0 text-slate-900">{item.count}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max((item.count / max) * 100, 3)}%` }} /></div>
    </div>) : <p className="text-[10px] font-semibold text-slate-400">Xog ma jirto.</p>}</div>
  </div>;
}

function BranchHierarchyChart({ groups }: { groups: Array<{ neighborhood: string; count: number; branches: Array<{ label: string; count: number }> }> }) {
  const [selected, setSelected] = useState<string | null>(groups[0]?.neighborhood || null);
  const active = groups.find((group) => group.neighborhood === selected);
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="text-xs font-black text-slate-800">Count by Laanta</h3>
    <p className="mt-1 text-[9px] font-semibold text-slate-400">Xaafad guji si aad u aragto laamaheeda.</p>
    <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">{groups.map((group) => <button type="button" key={group.neighborhood} onClick={() => setSelected(group.neighborhood === selected ? null : group.neighborhood)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[10px] font-black transition ${group.neighborhood === selected ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}><span className="truncate">{group.neighborhood}</span><span>{group.count}</span></button>)}</div>
    {active && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3"><p className="text-[9px] font-black uppercase tracking-wider text-violet-600">Laamaha {active.neighborhood}</p>{active.branches.map((branch) => <div key={branch.label} className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-600"><span>{branch.label}</span><span className="rounded-lg bg-violet-50 px-2 py-0.5 text-violet-700">{branch.count}</span></div>)}</div>}
  </div>;
}

export default function ReportsPage() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tab, setTab] = useState<Tab>('surveys');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  async function load() {
    if (startDate && endDate && startDate > endDate) return setError('Taariikhda bilowga kama dambayn karto taariikhda dhammaadka.');
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate); if (endDate) params.set('end', endDate);
      const response = await fetch(`/api/reports?${params}`, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Report-ka lama soo qaadi karin.');
      setData(result); setLastUpdated(new Date());
    } catch (err) { setError(err instanceof Error ? err.message : 'Report-ka lama soo qaadi karin.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // `load` intentionally follows the selected report period only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  async function downloadExport(format: 'geojson' | 'backup') {
    if (format !== 'backup' && !canAction(profile, 'report.export')) { setError('Ma lihid Reports Export permission.'); return; }
    setDownloading(format); setError(null);
    try {
      const response = await fetch(`/api/reports?format=${format}`, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: 'no-store' });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Download-ku wuu fashilmay.'); }
      const filename = (response.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || `marwaazpn-${format}`;
      saveBlob(await response.blob(), filename);
    } catch (err) { setError(err instanceof Error ? err.message : 'Download-ku wuu fashilmay.'); }
    finally { setDownloading(null); }
  }

  function openExport(format: ExportFormat) {
    if (!canAction(profile, 'report.export')) { setError('Ma lihid Reports Export permission.'); return; }
    setSelectedSections(exportSections[tab].map((section) => section.id));
    setExportFormat(format);
  }

  function csvCell(value: unknown) {
    let text = String(value ?? '-');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  async function downloadCsv(selectedTab: Tab, selected: Set<string>) {
    if (!data) return;
    setDownloading('csv'); setError(null);
    try {
      const rows: string[][] = [];
      const section = (title: string, headers: string[], values: Array<Array<string | number>>) => {
        if (rows.length) rows.push([]);
        rows.push([title], headers, ...values.map((row) => row.map(String)));
      };
      const period = data.period.start || data.period.end ? `${data.period.start || 'Beginning'} to ${data.period.end || 'Today'}` : 'All time';
      rows.push(['MARWAAZPN APP'], [`${selectedTab[0].toUpperCase()}${selectedTab.slice(1)} Report`], ['Period', period], ['Generated', new Date().toLocaleString('en-GB')]);
      const summary = data.summary;
      const breakdown = (id: string, title: string, items: Array<{ label: string; count: number }>) => {
        if (selected.has(id)) section(title, ['Value', 'Count'], items.map((item) => [item.label, item.count]));
      };
      if (selectedTab === 'surveys') {
        if (selected.has('summary')) section('Survey Summary', ['Total surveys', 'Pending review', 'Approved', 'Rejected'], [[summary.surveys, summary.statusCounts['Pending Review'] || 0, summary.statusCounts.Approved || 0, summary.statusCounts.Rejected || 0]]);
        if (selected.has('workflow')) section('Survey Workflow', ['Status', 'Count', 'Share'], ['Draft', 'Pending Review', 'Approved', 'Rejected', 'Archived'].map((value) => [value, summary.statusCounts[value] || 0, `${summary.surveys ? Math.round((summary.statusCounts[value] || 0) / summary.surveys * 100) : 0}%`]));
        breakdown('neighborhoods', 'Count by Xaafadaha', data.breakdowns.surveys.neighborhoods);
        if (selected.has('branches')) section('Count by Laanta', ['Xaafad', 'Laanta', 'Count'], data.breakdowns.surveys.branchGroups.flatMap((group) => group.branches.map((branch) => [group.neighborhood, branch.label, branch.count])));
        breakdown('creators', 'Count by Record Creator', data.breakdowns.surveys.creators); breakdown('landTypes', 'Count by Nooca Dhulka', data.breakdowns.surveys.landTypes);
        if (selected.has('records')) section('Survey Records', ['Survey', 'Xaafad', 'Laanta', 'Land type', 'Creator'], data.recentSurveys.map((r) => [r.survey_no || r.serial_no, r.neighborhood, r.branch || '-', r.land_type || '-', r.creator || '-']));
      } else if (selectedTab === 'references') {
        if (selected.has('summary')) section('Reference Summary', ['Total references', 'Open references'], [[summary.references, summary.openReferences]]);
        breakdown('subjects', 'Count by Ujeedada', data.breakdowns.references.subjects); breakdown('paymentStatuses', 'Count by Status', data.breakdowns.references.paymentStatuses); breakdown('workflowStatuses', 'Count by Workflow Status', data.breakdowns.references.workflowStatuses); breakdown('creators', 'Count by Record Creator', data.breakdowns.references.creators);
        if (selected.has('records')) section('Reference Records', ['Reference', 'Subject', 'Status', 'Workflow', 'Creator'], data.recentReferences.map((r) => [r.ref_number, r.subject, r.payment_status, r.status, r.creator || '-']));
      } else if (selectedTab === 'payments') {
        if (selected.has('summary')) section('Payment Summary', ['Paid income', 'Outstanding credit'], [[money.format(summary.paidIncome), money.format(summary.outstandingCredit)]]);
        breakdown('subjects', 'Count by Ujeedo (Subject)', data.breakdowns.payments.subjects); breakdown('statuses', 'Count by Status / Action', data.breakdowns.payments.statuses); breakdown('creators', 'Count by Record Creator', data.breakdowns.payments.creators);
        if (selected.has('records')) section('Payment Records', ['Receipt', 'Subject', 'Status / Action', 'Creator', 'Amount'], data.recentPayments.map((r) => [r.receipt_no, r.subject || '-', `${r.status} / ${r.payment_mode}`, r.creator || '-', money.format(Number(r.amount))]));
      } else {
        if (selected.has('summary')) section('Expense Summary', ['Total expenses'], [[money.format(summary.expenses)]]);
        breakdown('descriptions', 'Count by Description', data.breakdowns.expenses.descriptions); breakdown('creators', 'Count by Created By', data.breakdowns.expenses.creators);
        if (selected.has('records')) section('Expense Records', ['Expense', 'Description', 'Created By', 'Total'], data.recentExpenses.map((r) => [r.expense_no || r.id, r.description, r.creator || '-', money.format(Number(r.total))]));
      }
      const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
      const rangeName = `${data.period.start || 'all'}-${data.period.end || 'time'}`;
      saveBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), `marwaazpn-${selectedTab}-report-${rangeName}.csv`);
    } catch (err) { setError(err instanceof Error ? err.message : 'CSV download-ku wuu fashilmay.'); }
    finally { setDownloading(null); }
  }

  async function downloadPdf(selectedTab: Tab, selected: Set<string>) {
    if (!data) return;
    setDownloading('pdf'); setError(null);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 14;
      let y = 45;
      const space = (needed: number) => { if (y + needed > height - 16) { doc.addPage(); y = 16; } };
      const heading = (title: string) => { space(14); doc.setFillColor(241, 245, 249); doc.roundedRect(margin, y, width - margin * 2, 10, 2, 2, 'F'); doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, margin + 3, y + 6.7); y += 14; };
      const table = (headers: string[], rows: string[][], widths: number[]) => {
        const total = widths.reduce((a, b) => a + b, 0); space(16);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        const headerLines = headers.map((value, index) => doc.splitTextToSize(value, widths[index] - 3) as string[]);
        const headerHeight = Math.max(10, Math.max(...headerLines.map((lines) => lines.length)) * 4.3 + 3);
        const drawHeader = () => {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setFillColor(37, 99, 235); doc.rect(margin, y, total, headerHeight, 'F'); doc.setTextColor(255);
          let headerX = margin;
          headerLines.forEach((lines, index) => { doc.text(lines, headerX + 2, y + 4.8); headerX += widths[index]; });
          y += headerHeight;
        };
        drawHeader();
        rows.forEach((row, rowIndex) => {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
          const cells = row.map((value, index) => doc.splitTextToSize(String(value ?? '-').slice(0, 80), widths[index] - 4) as string[]);
          const rowHeight = Math.max(10, Math.max(...cells.map((lines) => lines.length)) * 4.3 + 4);
          if (y + rowHeight > height - 16) { doc.addPage(); y = 16; drawHeader(); }
          if (rowIndex % 2) { doc.setFillColor(248, 250, 252); doc.rect(margin, y, total, rowHeight, 'F'); }
          doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.rect(margin, y, total, rowHeight); doc.setTextColor(51, 65, 85);
          let cellX = margin;
          cells.forEach((lines, index) => {
            if (index > 0) doc.line(cellX, y, cellX, y + rowHeight);
            const textHeight = lines.length * 4.3;
            const textY = y + Math.max(4.8, (rowHeight - textHeight) / 2 + 3.4);
            doc.text(lines, cellX + 2, textY);
            cellX += widths[index];
          });
          y += rowHeight;
        }); y += 5;
      };
      doc.setFillColor(37, 99, 235); doc.rect(0, 0, width, 38, 'F');
      let titleX = margin;
      if (settings.logo_url) {
        try {
          const logo = await imageUrlToPngData(settings.logo_url);
          doc.setFillColor(255, 255, 255); doc.roundedRect(margin, 6, 24, 24, 3, 3, 'F');
          doc.addImage(logo, 'PNG', margin + 2, 8, 20, 20, undefined, 'FAST');
          titleX = margin + 27;
        } catch (logoError) { console.warn('[Reports PDF] Logo could not be embedded:', logoError); }
      }
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text((settings.org_name_en || 'Marwaaz Public Notary').toUpperCase(), titleX, 14, { maxWidth: width - titleX - margin }); doc.setFontSize(10); doc.text(`${selectedTab[0].toUpperCase()}${selectedTab.slice(1)} Report`, titleX, 22); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      const period = data.period.start || data.period.end ? `${data.period.start || 'Beginning'} to ${data.period.end || 'Today'}` : 'All time';
      doc.text(`Period: ${period} | Generated: ${new Date().toLocaleString('en-GB')}`, titleX, 30, { maxWidth: width - titleX - margin });
      const s = data.summary;
      const breakdownTable = (title: string, items: Array<{ label: string; count: number }>) => {
        heading(title);
        table(['Value', 'Count'], items.map((item) => [item.label, `${item.count}`]), [140, 46]);
      };
      if (selectedTab === 'surveys') {
        if (selected.has('summary')) { heading('Survey Summary'); table(['Total surveys', 'Pending review', 'Approved', 'Rejected'], [[`${s.surveys}`, `${s.statusCounts['Pending Review'] || 0}`, `${s.statusCounts.Approved || 0}`, `${s.statusCounts.Rejected || 0}`]], [47, 47, 46, 46]); }
        if (selected.has('workflow')) { heading('Survey Workflow'); table(['Status', 'Count', 'Share'], ['Draft', 'Pending Review', 'Approved', 'Rejected', 'Archived'].map((v) => [v, `${s.statusCounts[v] || 0}`, `${s.surveys ? Math.round((s.statusCounts[v] || 0) / s.surveys * 100) : 0}%`]), [82, 48, 56]); }
        if (selected.has('neighborhoods')) breakdownTable('Count by Xaafadaha', data.breakdowns.surveys.neighborhoods);
        if (selected.has('branches')) { heading('Count by Laanta (Xaafad kasta)'); table(['Xaafad', 'Laanta', 'Count'], data.breakdowns.surveys.branchGroups.flatMap((group) => group.branches.map((branch) => [group.neighborhood, branch.label, `${branch.count}`])), [70, 76, 40]); }
        if (selected.has('creators')) breakdownTable('Count by Record Creator', data.breakdowns.surveys.creators);
        if (selected.has('landTypes')) breakdownTable('Count by Nooca Dhulka', data.breakdowns.surveys.landTypes);
        if (selected.has('records')) { heading('Survey Records'); table(['Survey', 'Xaafad', 'Laanta', 'Nooca Dhulka', 'Record Creator'], data.recentSurveys.map((r) => [`${r.survey_no || r.serial_no}`, r.neighborhood, r.branch || '-', r.land_type || '-', r.creator || '-']), [27, 38, 34, 38, 49]); }
      } else if (selectedTab === 'references') {
        if (selected.has('summary')) { heading('Reference Summary'); table(['Total references', 'Open references'], [[`${s.references}`, `${s.openReferences}`]], [93, 93]); }
        if (selected.has('subjects')) breakdownTable('Count by Ujeedada', data.breakdowns.references.subjects);
        if (selected.has('paymentStatuses')) breakdownTable('Count by Status', data.breakdowns.references.paymentStatuses);
        if (selected.has('workflowStatuses')) breakdownTable('Count by Workflow Status', data.breakdowns.references.workflowStatuses);
        if (selected.has('creators')) breakdownTable('Count by Record Creator', data.breakdowns.references.creators);
        if (selected.has('records')) { heading('Reference Records'); table(['Reference', 'Subject', 'Status', 'Workflow', 'Creator'], data.recentReferences.map((r) => [r.ref_number, r.subject, r.payment_status, r.status, r.creator || '-']), [30, 58, 27, 32, 39]); }
      } else if (selectedTab === 'payments') {
        if (selected.has('summary')) { heading('Payment Summary'); table(['Paid income', 'Outstanding credit'], [[money.format(s.paidIncome), money.format(s.outstandingCredit)]], [93, 93]); }
        if (selected.has('subjects')) breakdownTable('Count by Ujeedo (Subject)', data.breakdowns.payments.subjects);
        if (selected.has('statuses')) breakdownTable('Count by Status / Action', data.breakdowns.payments.statuses);
        if (selected.has('creators')) breakdownTable('Count by Record Creator', data.breakdowns.payments.creators);
        if (selected.has('records')) { heading('Payment Records'); table(['Receipt', 'Subject', 'Status / Action', 'Creator', 'Amount'], data.recentPayments.map((r) => [r.receipt_no, r.subject || '-', `${r.status} / ${r.payment_mode}`, r.creator || '-', money.format(Number(r.amount))]), [31, 55, 37, 38, 25]); }
      } else {
        if (selected.has('summary')) { heading('Expense Summary'); table(['Total expenses'], [[money.format(s.expenses)]], [186]); }
        if (selected.has('descriptions')) breakdownTable('Count by Description', data.breakdowns.expenses.descriptions);
        if (selected.has('creators')) breakdownTable('Count by Created By', data.breakdowns.expenses.creators);
        if (selected.has('records')) { heading('Expense Records'); table(['Expense', 'Description', 'Created By', 'Total'], data.recentExpenses.map((r) => [r.expense_no || `${r.id}`, r.description, r.creator || '-', money.format(Number(r.total))]), [32, 72, 50, 32]); }
      }
      const pages = doc.getNumberOfPages(); for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setDrawColor(226, 232, 240); doc.line(margin, height - 10, width - margin, height - 10); doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(`${settings.org_name_en || 'Marwaaz Public Notary'} - Confidential Management Report`, margin, height - 5); doc.text(`Page ${page} of ${pages}`, width - margin, height - 5, { align: 'right' }); }
      const rangeName = `${data.period.start || 'all'}-${data.period.end || 'time'}`;
      saveBlob(doc.output('blob'), `marwaazpn-${selectedTab}-report-${rangeName}.pdf`);
    } catch (err) { console.error(err); setError(err instanceof Error ? err.message : 'PDF download-ku wuu fashilmay.'); }
    finally { setDownloading(null); }
  }

  const s = data?.summary, statusTotal = Math.max(s?.surveys || 0, 1);
  const activity = () => {
    const empty = <div className="p-10 text-center text-xs font-bold text-slate-400">Xog kama jirto muddadan.</div>;
    if (!data) return empty;
    const th = 'whitespace-nowrap bg-slate-50 px-5 py-3 text-left text-[9px] font-black uppercase tracking-wider text-slate-500';
    const td = 'px-5 py-3 align-top text-xs text-slate-600';
    if (tab === 'surveys') return data.recentSurveys.length ? <table className="min-w-[1050px] w-full table-fixed"><thead><tr><th className={`${th} w-28`}>Survey</th><th className={`${th} w-52`}>Owner</th><th className={`${th} w-40`}>Xaafadda</th><th className={`${th} w-36`}>Laanta</th><th className={`${th} w-40`}>Nooca Dhulka</th><th className={`${th} w-48`}>Record Creator</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentSurveys.map(r => <tr key={r.id} className="hover:bg-slate-50/70"><td className={`${td} font-black text-blue-600`}>{r.survey_no || r.serial_no}</td><td className={`${td} font-bold text-slate-800 break-words`}>{r.owner_name}</td><td className={td}>{r.neighborhood || '-'}</td><td className={td}>{r.branch || '-'}</td><td className={td}>{r.land_type || '-'}</td><td className={`${td} font-semibold`}>{r.creator || '-'}</td></tr>)}</tbody></table> : empty;
    if (tab === 'references') return data.recentReferences.length ? <table className="min-w-[950px] w-full table-fixed"><thead><tr><th className={`${th} w-32`}>Reference</th><th className={`${th} w-72`}>Ujeedada</th><th className={`${th} w-32`}>Status</th><th className={`${th} w-40`}>Workflow Status</th><th className={`${th} w-48`}>Record Creator</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentReferences.map(r => <tr key={r.id} className="hover:bg-slate-50/70"><td className={`${td} font-black text-blue-600`}>{r.ref_number}</td><td className={`${td} break-words`}>{r.subject}</td><td className={td}>{r.payment_status}</td><td className={td}>{r.status}</td><td className={`${td} font-semibold`}>{r.creator || '-'}</td></tr>)}</tbody></table> : empty;
    if (tab === 'payments') return data.recentPayments.length ? <table className="min-w-[900px] w-full table-fixed"><thead><tr><th className={`${th} w-36`}>Receipt</th><th className={`${th} w-72`}>Ujeedo (Subject)</th><th className={`${th} w-40`}>Status / Action</th><th className={`${th} w-48`}>Record Creator</th><th className={`${th} w-32`}>Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentPayments.map(r => <tr key={r.id} className="hover:bg-slate-50/70"><td className={`${td} font-black text-teal-600`}>{r.receipt_no}</td><td className={`${td} break-words`}>{r.subject || '-'}</td><td className={td}>{r.status} / {r.payment_mode}</td><td className={`${td} font-semibold`}>{r.creator || '-'}</td><td className={`${td} font-black text-emerald-600`}>{money.format(Number(r.amount))}</td></tr>)}</tbody></table> : empty;
    if (tab === 'expenses') return data.recentExpenses.length ? <table className="min-w-[760px] w-full table-fixed"><thead><tr><th className={`${th} w-36`}>Expense</th><th className={`${th} w-80`}>Description</th><th className={`${th} w-52`}>Created By</th><th className={`${th} w-32`}>Total</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentExpenses.map(r => <tr key={r.id} className="hover:bg-slate-50/70"><td className={`${td} font-black text-rose-600`}>{r.expense_no || r.id}</td><td className={`${td} break-words`}>{r.description}</td><td className={`${td} font-semibold`}>{r.creator || '-'}</td><td className={`${td} font-black text-rose-600`}>{money.format(Number(r.total))}</td></tr>)}</tbody></table> : empty;
    return empty;
  };

  const charts = () => {
    if (!data) return null;
    const sets = data.breakdowns[tab];
    if (tab === 'surveys') return <><BreakdownChart title="Count by Xaafadaha" items={sets.neighborhoods} /><BranchHierarchyChart groups={data.breakdowns.surveys.branchGroups} /><BreakdownChart title="Count by Record Creator" items={sets.creators} color="bg-emerald-500" /><BreakdownChart title="Count by Nooca Dhulka" items={sets.landTypes} color="bg-amber-500" /></>;
    if (tab === 'references') return <><BreakdownChart title="Count by Ujeedada" items={sets.subjects} /><BreakdownChart title="Count by Status" items={sets.paymentStatuses} color="bg-emerald-500" /><BreakdownChart title="Count by Workflow Status" items={sets.workflowStatuses} color="bg-violet-500" /><BreakdownChart title="Count by Record Creator" items={sets.creators} color="bg-amber-500" /></>;
    if (tab === 'payments') return <><BreakdownChart title="Count by Ujeedo (Subject)" items={sets.subjects} /><BreakdownChart title="Count by Status / Action" items={sets.statuses} color="bg-emerald-500" /><BreakdownChart title="Count by Record Creator" items={sets.creators} color="bg-violet-500" /></>;
    return <><BreakdownChart title="Count by Description" items={sets.descriptions} color="bg-rose-500" /><BreakdownChart title="Count by Created By" items={sets.creators} color="bg-amber-500" /></>;
  };

  return <div className="min-h-full bg-slate-50 p-4 text-slate-800 md:p-7 print:bg-white print:p-0"><div className="mx-auto max-w-[1450px] space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><BarChart3 className="h-5 w-5" /></span><div><h1 className="text-xl font-black">Reports & Data Export</h1><p className="mt-1 text-xs font-semibold text-slate-500">Warbixin maamul, finance, GIS export iyo backup.</p></div></div><div className="flex flex-wrap gap-2 print:hidden"><button onClick={() => void load()} className="action secondary"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh</button>{canAction(profile, 'report.export') ? (<button onClick={() => window.print()} className="action secondary"><Printer className="h-4 w-4" /> Print</button>) : null}{canAction(profile, 'report.export') ? (<button onClick={() => openExport('pdf')} disabled={!data || !!downloading} className="action bg-rose-600 text-white">{downloading === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF</button>) : null}{canAction(profile, 'report.export') ? (<button onClick={() => openExport('csv')} disabled={!data || !!downloading} className="action bg-emerald-600 text-white">{downloading === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} CSV</button>) : null}{canAction(profile, 'report.export') ? (<button onClick={() => void downloadExport('geojson')} disabled={!!downloading} className="action bg-blue-600 text-white"><FileJson className="h-4 w-4" /> GeoJSON</button>) : null}{profile?.role === 'Admin' && <button onClick={() => void downloadExport('backup')} disabled={!!downloading} className="action bg-slate-900 text-white"><Archive className="h-4 w-4" /> Backup</button>}</div></div>
      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 print:hidden"><label className="filter">From<input type="date" value={startDate} max={endDate || undefined} onChange={e => setStartDate(e.target.value)} /></label><label className="filter">To<input type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)} /></label><button onClick={() => { setStartDate(''); setEndDate(''); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">All time</button>{lastUpdated && <span className="ml-auto text-[10px] text-slate-400">Updated {lastUpdated.toLocaleTimeString()}</span>}</div></section>
    <style jsx>{`.action{display:flex;align-items:center;gap:.5rem;border-radius:.75rem;padding:.625rem .875rem;font-size:10px;font-weight:900}.action:disabled{opacity:.5}.secondary{border:1px solid #e2e8f0;background:white}.filter{font-size:10px;font-weight:900;text-transform:uppercase;color:#64748b}.filter input{display:block;margin-top:4px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:8px 12px;font-size:12px}.metric{border-radius:16px;padding:16px;display:grid;gap:6px}.metric :global(svg){width:20px}.metric b{font-size:9px;text-transform:uppercase}.metric strong{font-size:18px}`}</style>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">{error}</div>}
    {loading ? <CardLoadingSkeleton /> : s && data && <>
      {(tab === 'payments' || tab === 'expenses') && <section className="grid gap-3 sm:grid-cols-3"><button onClick={() => setTab('payments')} className={`metric text-left transition ${tab === 'payments' ? 'bg-emerald-100 ring-2 ring-emerald-200' : 'bg-emerald-50'}`}><TrendingUp className="text-emerald-600" /><b>Income / Payments</b><strong>{money.format(s.paidIncome)}</strong></button><button onClick={() => setTab('expenses')} className={`metric text-left transition ${tab === 'expenses' ? 'bg-rose-100 ring-2 ring-rose-200' : 'bg-rose-50'}`}><TrendingDown className="text-rose-600" /><b>Expenses</b><strong>{money.format(s.expenses)}</strong></button><div className="metric bg-amber-50"><Download className="text-amber-600" /><b>Credit</b><strong>{money.format(s.outstandingCredit)}</strong></div></section>}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white p-4 sm:p-5">
          <div className="mb-4"><h2 className="text-base font-black capitalize text-slate-900">{tab} report</h2><p className="mt-0.5 text-[10px] font-semibold text-slate-500">Dooro qaybta aad rabto; charts-ka iyo records-ku hoos ayay isku beddelayaan.</p></div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {([
              { id: 'surveys', label: 'Survey', detail: `${s.surveys} records`, icon: BarChart3, active: 'border-blue-400 bg-blue-600 text-white shadow-blue-200', iconStyle: 'bg-blue-50 text-blue-600' },
              { id: 'references', label: 'Reference', detail: `${s.references} records`, icon: FileText, active: 'border-violet-400 bg-violet-600 text-white shadow-violet-200', iconStyle: 'bg-violet-50 text-violet-600' },
              { id: 'payments', label: 'Payments', detail: money.format(s.paidIncome), icon: TrendingUp, active: 'border-emerald-400 bg-emerald-600 text-white shadow-emerald-200', iconStyle: 'bg-emerald-50 text-emerald-600' },
              { id: 'expenses', label: 'Expenses', detail: money.format(s.expenses), icon: TrendingDown, active: 'border-rose-400 bg-rose-600 text-white shadow-rose-200', iconStyle: 'bg-rose-50 text-rose-600' },
            ] as const).map(({ id, label, detail, icon: Icon, active, iconStyle }) => {
              const selected = tab === id;
              return <button key={id} onClick={() => setTab(id)} className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200 ${selected ? `${active} -translate-y-0.5 shadow-lg` : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-white/20 text-white' : iconStyle}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block truncate text-xs font-black">{label}</span><span className={`mt-0.5 block truncate text-[9px] font-semibold ${selected ? 'text-white/80' : 'text-slate-400'}`}>{detail}</span></span>
              </button>;
            })}
          </div>
        </div>
        {tab === 'surveys' && <div className="border-b border-slate-100 p-5"><h3 className="text-xs font-black text-slate-800">Survey Workflow Status</h3><div className="mt-4 grid gap-3 sm:grid-cols-5">{['Draft', 'Pending Review', 'Approved', 'Rejected', 'Archived'].map(v => { const count = s.statusCounts[v] || 0, percent = Math.round(count / statusTotal * 100); return <div key={v}><div className="mb-1 flex justify-between text-[9px] font-black"><span>{v}</span><span>{count}</span></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${statusColors[v]}`} style={{ width: `${percent}%` }} /></div></div>; })}</div></div>}
        <div className="grid gap-4 bg-slate-50/50 p-4 md:grid-cols-2 xl:grid-cols-4">{charts()}</div>
        <div className="overflow-x-auto">{activity()}</div>
      </section></>}
  </div>
  {exportFormat && data && <div className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm print:hidden" role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !downloading) setExportFormat(null); }}>
    <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-100 bg-teal-50 text-teal-600">{exportFormat === 'pdf' ? <FileText className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}</span><div><h2 id="export-title" className="text-base font-black capitalize text-slate-900">Choose {tab} {exportFormat.toUpperCase()} data</h2><p className="mt-1 text-xs font-semibold text-slate-500">Dooro qaybaha aad rabto in faylka lagu daro.</p></div></div>
        <button type="button" aria-label="Close" disabled={!!downloading} onClick={() => setExportFormat(null)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </header>
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
          <div><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Current filters</p><p className="mt-1 text-xs font-bold text-slate-700">{data.period.start || 'Beginning'} — {data.period.end || 'Today'}</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => setSelectedSections(exportSections[tab].map((section) => section.id))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700">Select all</button><button type="button" onClick={() => setSelectedSections([])} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500">Clear</button></div>
        </div>
        <div className="grid max-h-[48vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {exportSections[tab].map((section) => { const checked = selectedSections.includes(section.id); return <label key={section.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${checked ? 'border-teal-300 bg-teal-50 ring-1 ring-teal-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><input type="checkbox" checked={checked} onChange={() => setSelectedSections((current) => checked ? current.filter((id) => id !== section.id) : [...current, section.id])} className="h-4 w-4 rounded border-slate-300 accent-teal-600" /><span className="text-xs font-black text-slate-700">{section.label}</span></label>; })}
        </div>
        {!selectedSections.length && <p className="mt-3 text-xs font-bold text-rose-600">Ugu yaraan hal qayb dooro.</p>}
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={!!downloading} onClick={() => setExportFormat(null)} className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600 transition hover:bg-slate-200">Cancel</button><button type="button" disabled={!selectedSections.length || !!downloading} onClick={async () => { const format = exportFormat; const selected = new Set(selectedSections); if (format === 'pdf') await downloadPdf(tab, selected); else await downloadCsv(tab, selected); setExportFormat(null); }} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-500 px-5 py-2.5 text-xs font-black text-white shadow-md transition hover:from-teal-500 hover:to-teal-600 disabled:opacity-50">{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download {exportFormat.toUpperCase()} ({selectedSections.length})</button></div>
      </div>
    </div>
  </div>}
  </div>;
}

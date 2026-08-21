'use client';

import { useEffect, useState } from 'react';
import { Archive, BarChart3, Download, FileJson, FileSpreadsheet, Loader2, Printer, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CardLoadingSkeleton } from '@/components/Skeleton';

type ReportData = {
  schemaReady: boolean;
  summary: {
    surveys: number; references: number; openReferences: number; transfers: number; transferValue: number;
    paidIncome: number; outstandingCredit: number; expenses: number; statusCounts: Record<string, number>;
  };
  recentSurveys: Array<{ id: number; serial_no: number; survey_no?: string | null; owner_name: string; neighborhood: string; status: string; sketch_area?: string; created_at?: string }>;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const statusColors: Record<string, string> = { Draft: 'bg-slate-500', 'Pending Review': 'bg-amber-500', Approved: 'bg-emerald-500', Rejected: 'bg-rose-500', Archived: 'bg-violet-500' };

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Fadlan dib u gal.');
  return session.access_token;
}

export default function ReportsPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      const response = await fetch('/api/reports', { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Report-ka lama soo qaadi karin.');
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Report-ka lama soo qaadi karin.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function downloadReport(format: 'csv' | 'geojson' | 'backup') {
    setDownloading(format);
    setError(null);
    try {
      const token = await accessToken();
      const response = await fetch(`/api/reports?format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Download-ku wuu fashilmay.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const name = disposition.match(/filename="([^"]+)"/)?.[1] || `marwaazpn-app-${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Download-ku wuu fashilmay.');
    } finally {
      setDownloading(null);
    }
  }

  const summary = data?.summary;
  const net = (summary?.paidIncome || 0) - (summary?.expenses || 0);
  const statusTotal = Math.max(summary?.surveys || 0, 1);

  return <div className="min-h-full bg-slate-50 p-4 text-slate-800 md:p-7 print:bg-white print:p-0">
    <div className="mx-auto max-w-[1450px] space-y-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><BarChart3 className="h-5 w-5" /></span><div><h1 className="text-xl font-black text-slate-900">Reports & Data Export</h1><p className="mt-1 text-xs font-semibold text-slate-500">Warbixin guud, GIS export iyo backup ammaan ah.</p></div></div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[10px] font-black text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" /> Print</button>
          <button onClick={() => downloadReport('csv')} disabled={Boolean(downloading)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-[10px] font-black text-white disabled:opacity-50">{downloading === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} CSV</button>
          <button onClick={() => downloadReport('geojson')} disabled={Boolean(downloading)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-[10px] font-black text-white disabled:opacity-50">{downloading === 'geojson' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />} GeoJSON</button>
          {profile?.role === 'Admin' && <button onClick={() => downloadReport('backup')} disabled={Boolean(downloading)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-[10px] font-black text-white disabled:opacity-50">{downloading === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Backup</button>}
        </div>
      </section>

      {error && <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700"><span>{error}</span><button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2"><RefreshCw className="h-3.5 w-3.5" /> Isku day</button></div>}
      {loading ? <CardLoadingSkeleton /> : summary && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Surveys', value: summary.surveys.toLocaleString(), detail: `${summary.statusCounts['Pending Review'] || 0} sugaya ansixin`, color: 'bg-blue-50 text-blue-600' },
            { label: 'References', value: summary.references.toLocaleString(), detail: `${summary.openReferences} wali socda`, color: 'bg-violet-50 text-violet-600' },
            { label: 'Wareejinta', value: summary.transfers.toLocaleString(), detail: money.format(summary.transferValue), color: 'bg-amber-50 text-amber-600' },
            { label: 'Net balance', value: money.format(net), detail: `${money.format(summary.outstandingCredit)} credit`, color: net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600' },
          ].map((card) => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`inline-flex rounded-xl px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${card.color}`}>{card.label}</span><p className="mt-4 text-2xl font-black tracking-tight text-slate-900">{card.value}</p><p className="mt-1 text-[10px] font-bold text-slate-500">{card.detail}</p></div>)}
        </section>

        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900">Survey workflow</h2><p className="mt-1 text-[10px] font-semibold text-slate-500">Xaaladda dhammaan diiwaannada.</p>
            <div className="mt-5 space-y-4">{['Draft', 'Pending Review', 'Approved', 'Rejected', 'Archived'].map((status) => { const count = summary.statusCounts[status] || 0; const percent = Math.round((count / statusTotal) * 100); return <div key={status}><div className="mb-1.5 flex justify-between text-[10px] font-black"><span className="text-slate-600">{status}</span><span className="text-slate-900">{count} · {percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${statusColors[status]}`} style={{ width: `${percent}%` }} /></div></div>; })}</div>
          </section>
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Surveys-kii ugu dambeeyey</h2><p className="mt-1 text-[10px] font-semibold text-slate-500">Diiwaannada cusub iyo status-kooda.</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">S/N</th><th className="px-5 py-3">Milkiile</th><th className="px-5 py-3">Xaafad</th><th className="px-5 py-3">Area</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-200/80">{data.recentSurveys.map((survey) => <tr key={survey.id}><td className="px-5 py-3 font-black text-slate-500">{survey.survey_no || survey.serial_no}</td><td className="px-5 py-3 font-black text-slate-800">{survey.owner_name}</td><td className="px-5 py-3 text-slate-500">{survey.neighborhood}</td><td className="px-5 py-3 text-slate-500">{survey.sketch_area || '-'}</td><td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">{survey.status || 'Draft'}</span></td></tr>)}</tbody></table></div>
          </section>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><TrendingUp className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-[9px] font-black uppercase text-emerald-700">Income</p><p className="mt-1 text-lg font-black text-slate-900">{money.format(summary.paidIncome)}</p></div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><TrendingDown className="h-5 w-5 text-rose-600" /><p className="mt-3 text-[9px] font-black uppercase text-rose-700">Expenses</p><p className="mt-1 text-lg font-black text-slate-900">{money.format(summary.expenses)}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><Download className="h-5 w-5 text-amber-600" /><p className="mt-3 text-[9px] font-black uppercase text-amber-700">Credit</p><p className="mt-1 text-lg font-black text-slate-900">{money.format(summary.outstandingCredit)}</p></div>
        </section>
      </>}
    </div>
  </div>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Download, FileText, Loader2, Palette,
  PanelLeftClose, PanelLeftOpen, Printer, RefreshCw, Search, Settings2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import type { Survey } from '@/types';

type SectionKey = 'summary' | 'boundaries' | 'sketch' | 'certification';
type Design = {
  title: string;
  subtitle: string;
  accent: string;
  font: 'Arial' | 'Georgia' | 'Times New Roman';
  density: 'comfortable' | 'compact';
  showLogo: boolean;
  showFooter: boolean;
  sections: Record<SectionKey, boolean>;
  notes: string;
};

const defaultDesign: Design = {
  title: 'LAND SURVEY REPORT', subtitle: 'Warbixinta Sahanka Dhulka', accent: '#2563eb',
  font: 'Arial', density: 'comfortable', showLogo: true, showFooter: true,
  sections: { summary: true, boundaries: true, sketch: true, certification: true }, notes: '',
};

const sectionLabels: Record<SectionKey, string> = {
  summary: 'Xogta guud', boundaries: 'Xuduudaha', sketch: 'Naqshadda dhulka', certification: 'Ansixinta',
};

function parseCoordinates(value?: string | null): [number, number][] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    const raw = parsed?.coordinates?.[0] || parsed;
    if (Array.isArray(raw)) return raw.map((p) => Array.isArray(p) ? [Number(p[0]), Number(p[1])] as [number, number] : [Number(p.lat), Number(p.lng)] as [number, number]).filter((p) => p.every(Number.isFinite));
  } catch { /* accept a plain coordinate string below */ }
  return [...value.matchAll(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function PlotSketch({ survey, accent }: { survey: Survey; accent: string }) {
  const points = parseCoordinates(survey.polygon_boundary);
  if (points.length < 3) return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">Polygon-ka survey-gan lama gelin.</div>;
  const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1; const spanY = maxY - minY || 1;
  const mapped = points.map(([x, y]) => `${35 + ((x - minX) / spanX) * 530},${245 - ((y - minY) / spanY) * 205}`).join(' ');
  return <svg viewBox="0 0 600 280" className="h-56 w-full rounded-xl border border-slate-200 bg-slate-50">
    <defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#cbd5e1" strokeWidth="0.5" /></pattern></defs>
    <rect width="600" height="280" fill="url(#grid)" /><polygon points={mapped} fill={`${accent}22`} stroke={accent} strokeWidth="4" />
    {points.map((_, i) => { const [x, y] = mapped.split(' ')[i].split(','); return <g key={i}><circle cx={x} cy={y} r="5" fill="#fff" stroke={accent} strokeWidth="3"/><text x={Number(x)+8} y={Number(y)-8} fontSize="11" fontWeight="700" fill="#334155">P{i+1}</text></g>; })}
  </svg>;
}

export default function SurveyDesignerPage() {
  const { settings } = useSettings();
  const previewRef = useRef<HTMLDivElement>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [step, setStep] = useState(1);
  const [design, setDesign] = useState<Design>(defaultDesign);

  useEffect(() => { void (async () => {
    setLoading(true);
    const { data } = await supabase.from('surveys').select('*').order('serial_no', { ascending: false });
    const rows = (data || []) as Survey[]; setSurveys(rows); setSelectedId(rows[0]?.id ?? null); setLoading(false);
  })(); }, []);

  const selected = surveys.find((s) => s.id === selectedId) || null;
  const filtered = useMemo(() => surveys.filter((s) => `${s.owner_name} ${s.serial_no} ${s.survey_no || ''}`.toLowerCase().includes(search.toLowerCase())), [surveys, search]);
  const update = <K extends keyof Design>(key: K, value: Design[K]) => setDesign((d) => ({ ...d, [key]: value }));
  const toggleSection = (key: SectionKey) => setDesign((d) => ({ ...d, sections: { ...d.sections, [key]: !d.sections[key] } }));

  const downloadPdf = async () => {
    if (!previewRef.current || !selected) return;
    setExporting(true);
    try {
      const mod = await import('html2pdf.js'); const html2pdf = mod.default || mod;
      await html2pdf().set({ margin: 0, filename: `Survey_${selected.survey_no || selected.serial_no}_${selected.owner_name.replace(/\W+/g, '_')}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(previewRef.current).save();
    } finally { setExporting(false); }
  };

  const field = (label: string, value?: string | number | null) => <div className="border-b border-slate-200 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-0.5 text-[12px] font-semibold text-slate-800">{value || '—'}</p></div>;
  const steps = ['Dooro survey', 'Habee design-ka', 'Hubi & soo dejiso'];

  return <div className="min-h-full bg-slate-100 p-3 text-slate-800 md:p-6">
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><div className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white"><FileText className="h-5 w-5"/></span><div><h1 className="text-lg font-black">Survey PDF Studio</h1><p className="text-xs font-medium text-slate-500">Ku samee, ku hubi, kuna soo saar PDF-ga survey-ga gudaha system-ka.</p></div></div></div>
        <div className="flex items-center gap-2"><button onClick={() => window.print()} disabled={!selected} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold hover:bg-slate-50 disabled:opacity-40"><Printer className="h-4 w-4"/> Print</button><button onClick={downloadPdf} disabled={!selected || exporting} className="flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white shadow-lg shadow-teal-600/20 disabled:opacity-50">{exporting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}{exporting ? 'Diyaarinaya...' : 'Download PDF'}</button></div>
      </header>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        {steps.map((label, i) => <button key={label} onClick={() => setStep(i+1)} className={`flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-[11px] font-extrabold ${step === i+1 ? 'bg-teal-600 text-white' : step > i+1 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">{step > i+1 ? <Check className="h-3 w-3"/> : i+1}</span><span className="hidden sm:inline">{label}</span></button>)}
      </div>

      <main className={`grid gap-4 ${panelOpen ? 'lg:grid-cols-[340px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        {panelOpen && <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {step === 1 && <div className="space-y-3"><h2 className="text-sm font-black">1. Dooro survey-ga</h2><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Magac ama survey no..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-teal-500"/></div><div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">{loading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-teal-600"/></div> : filtered.map((s) => <button key={s.id} onClick={() => setSelectedId(s.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === s.id ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/10' : 'border-slate-200 hover:bg-slate-50'}`}><div className="flex justify-between gap-2"><p className="truncate text-xs font-extrabold">{s.owner_name}</p><span className="text-[10px] font-bold text-teal-700">#{s.survey_no || s.serial_no}</span></div><p className="mt-1 text-[10px] text-slate-500">{s.neighborhood} · {s.land_type}</p></button>)}</div></div>}
          {step === 2 && <div className="space-y-5"><div><h2 className="text-sm font-black">2. Habee design-ka</h2><p className="mt-1 text-[10px] text-slate-500">Isbeddel kasta preview-ga ayuu isla markiiba ka muuqanayaa.</p></div><label className="block text-[10px] font-bold text-slate-500">CINWAANKA<input value={design.title} onChange={(e) => update('title', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/></label><label className="block text-[10px] font-bold text-slate-500">CINWAAN-HOOSE<input value={design.subtitle} onChange={(e) => update('subtitle', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/></label><div className="grid grid-cols-2 gap-3"><label className="text-[10px] font-bold text-slate-500">MIDABKA<input type="color" value={design.accent} onChange={(e) => update('accent', e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 p-1"/></label><label className="text-[10px] font-bold text-slate-500">FONT<select value={design.font} onChange={(e) => update('font', e.target.value as Design['font'])} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-xs"><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></label></div><div><p className="mb-2 text-[10px] font-bold text-slate-500">QAYBAHA PDF-GA</p>{(Object.keys(sectionLabels) as SectionKey[]).map((key) => <label key={key} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-semibold"><span>{sectionLabels[key]}</span><input type="checkbox" checked={design.sections[key]} onChange={() => toggleSection(key)} className="h-4 w-4 accent-blue-600"/></label>)}</div><label className="block text-[10px] font-bold text-slate-500">QORAAL DHEERAAD AH<textarea value={design.notes} onChange={(e) => update('notes', e.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 p-3 text-xs" placeholder="Ku dar faahfaahin ama shuruud..."/></label><div className="flex gap-2"><button onClick={() => setDesign(defaultDesign)} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5"/> Reset</button><button onClick={() => update('showLogo', !design.showLogo)} className={`flex-1 rounded-xl border py-2.5 text-xs font-bold ${design.showLogo ? 'border-teal-300 bg-teal-50 text-teal-700' : 'border-slate-200'}`}>Logo</button></div></div>}
          {step === 3 && <div className="space-y-4"><h2 className="text-sm font-black">3. Hubi & soo dejiso</h2><div className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-800"><p className="font-extrabold">PDF-gu waa diyaar</p><p className="mt-1 leading-5">Hubi xogta iyo muuqaalka. Kadib isticmaal Download PDF ama Print.</p></div><div className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs"><div className="flex justify-between"><span className="text-slate-500">Survey</span><b>#{selected?.survey_no || selected?.serial_no || '—'}</b></div><div className="flex justify-between"><span className="text-slate-500">Milkiile</span><b className="max-w-40 truncate">{selected?.owner_name || '—'}</b></div><div className="flex justify-between"><span className="text-slate-500">Qaybo</span><b>{Object.values(design.sections).filter(Boolean).length}</b></div></div><button onClick={downloadPdf} disabled={!selected || exporting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-xs font-extrabold text-white"><Download className="h-4 w-4"/> Soo deji PDF</button></div>}
          <div className="mt-5 flex justify-between border-t border-slate-200 pt-4"><button onClick={() => setStep((s) => Math.max(1,s-1))} disabled={step===1} className="flex items-center gap-1 text-xs font-bold text-slate-500 disabled:opacity-30"><ChevronLeft className="h-4 w-4"/> Hore</button><button onClick={() => setStep((s) => Math.min(3,s+1))} disabled={step===3} className="flex items-center gap-1 text-xs font-bold text-teal-700 disabled:opacity-30">Xiga <ChevronRight className="h-4 w-4"/></button></div>
        </aside>}

        <section className="relative min-w-0 rounded-2xl border border-slate-200 bg-slate-200/70 p-3 md:p-6">
          <button onClick={() => setPanelOpen(!panelOpen)} title="Toggle editor" className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm">{panelOpen ? <PanelLeftClose className="h-4 w-4"/> : <PanelLeftOpen className="h-4 w-4"/>}</button>
          {!selected ? <div className="flex min-h-[700px] items-center justify-center text-sm font-bold text-slate-400">Dooro survey si preview-gu u soo baxo.</div> : <div className="mx-auto max-w-[794px] overflow-auto shadow-2xl"><div ref={previewRef} className="survey-pdf-preview min-h-[1123px] bg-white p-[52px] text-slate-900" style={{ fontFamily: design.font, '--pdf-accent': design.accent } as React.CSSProperties}>
            <div className="flex items-start justify-between border-b-4 pb-5" style={{ borderColor: design.accent }}><div className="flex items-center gap-4">{design.showLogo && settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="h-16 w-16 object-contain"/> : <div className="flex h-16 w-16 items-center justify-center rounded-xl text-white" style={{ background: design.accent }}><FileText className="h-8 w-8"/></div>}<div><p className="text-[18px] font-black">{settings.org_name_so}</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{settings.org_name_en}</p></div></div><div className="text-right"><p className="text-[10px] font-bold text-slate-400">SURVEY NO.</p><p className="text-xl font-black" style={{ color: design.accent }}>#{selected.survey_no || selected.serial_no}</p><p className="mt-1 text-[9px] text-slate-500">{selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-GB') : ''}</p></div></div>
            <div className="py-7 text-center"><h1 className="text-[25px] font-black tracking-tight">{design.title}</h1><p className="mt-1 text-[12px] font-semibold" style={{ color: design.accent }}>{design.subtitle}</p></div>
            {design.sections.summary && <section className="mb-6"><h2 className="mb-2 rounded-md px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white" style={{ background: design.accent }}>01 · Xogta Guud / General Information</h2><div className="grid grid-cols-2 gap-x-8">{field('Magaca Milkiilaha', selected.owner_name)}{field('Nooca Dhulka', selected.land_type)}{field('Xaafadda', selected.neighborhood)}{field('Laanta', selected.branch)}{field('Aagga / Vicinity', selected.vicinity)}{field('GPS Location', selected.gps_location)}{field('Baaxadda', selected.sketch_area)}{field('Faahfaahinta Dhismaha', selected.built_details)}</div></section>}
            {design.sections.boundaries && <section className="mb-6"><h2 className="mb-3 rounded-md px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white" style={{ background: design.accent }}>02 · Xuduudaha & Cabbirrada</h2><table className="w-full border-collapse text-[11px]"><thead><tr className="bg-slate-100"><th className="border border-slate-300 p-2 text-left">Jiho</th><th className="border border-slate-300 p-2 text-left">Cabbir</th><th className="border border-slate-300 p-2 text-left">Deris / Xad</th></tr></thead><tbody>{[['Waqooyi',selected.boundary_w_val,selected.boundary_w_neighbor],['Bari',selected.boundary_b_val,selected.boundary_b_neighbor],['Koonfur',selected.boundary_k_val,selected.boundary_k_neighbor],['Galbeed',selected.boundary_g_val,selected.boundary_g_neighbor]].map((r) => <tr key={r[0]}><td className="border border-slate-300 p-2 font-bold">{r[0]}</td><td className="border border-slate-300 p-2">{r[1] || '—'}</td><td className="border border-slate-300 p-2">{r[2] || '—'}</td></tr>)}</tbody></table></section>}
            {design.sections.sketch && <section className="mb-6 break-inside-avoid"><h2 className="mb-3 rounded-md px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white" style={{ background: design.accent }}>03 · Naqshadda Dhulka / Site Sketch</h2><PlotSketch survey={selected} accent={design.accent}/><p className="mt-2 text-center text-[9px] text-slate-400">Sketch-ku waa sawir xogeed; cabbirrada rasmiga ah ka eeg jadwalka xuduudaha.</p></section>}
            {design.notes && <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5"><b>Faahfaahin:</b> {design.notes}</div>}
            {design.sections.certification && <section className="mt-10 grid grid-cols-2 gap-16 text-center text-[10px]"><div><div className="border-t border-slate-500 pt-2 font-bold">Saxiixa Surveyor-ka</div><p className="mt-1 text-slate-400">Magac & Taariikh</p></div><div><div className="border-t border-slate-500 pt-2 font-bold">Shaabad & Ansixin</div><p className="mt-1 text-slate-400">Authorized Officer</p></div></section>}
            {design.showFooter && <footer className="mt-10 flex items-center justify-between border-t border-slate-200 pt-3 text-[8px] text-slate-400"><span>Generated by {settings.org_name_en} · Survey PDF Studio</span><span>Survey #{selected.survey_no || selected.serial_no}</span></footer>}
          </div></div>}
        </section>
      </main>
    </div>
  </div>;
}

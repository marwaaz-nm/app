'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Survey, SurveyDocument, SurveyRevision, SurveyStatus } from '@/types';
import type { BoundaryInfo } from '@/lib/geoDirection';
import { Archive, CheckCircle2, Clock3, FileText, History, Loader2, RotateCcw, Save, Send, ShieldCheck, Trash2, Upload, X, XCircle } from 'lucide-react';

const MiniMap = dynamic(() => import('@/components/MiniMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full bg-slate-50 border border-slate-200 rounded-3xl flex items-center justify-center text-xs text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
    </div>
  ),
});

type Tab = 'edit' | 'workflow' | 'documents' | 'history';
type Props = { record: Survey; onClose: () => void; onChanged: () => void };

const fields: Array<{ key: keyof Survey; label: string; wide?: boolean }> = [
  { key: 'owner_name', label: 'Magaca milkiilaha' },
  { key: 'land_type', label: 'Nooca dhulka' },
  { key: 'neighborhood', label: 'Xaafadda' },
  { key: 'branch', label: 'Laanta' },
  { key: 'vicinity', label: 'Nawaaxiga' },
  { key: 'boundary_w_val', label: 'Waqooyi — cabbirka' },
  { key: 'boundary_w_neighbor', label: 'Waqooyi — deriska' },
  { key: 'boundary_b_val', label: 'Bari — cabbirka' },
  { key: 'boundary_b_neighbor', label: 'Bari — deriska' },
  { key: 'boundary_k_val', label: 'Koonfur — cabbirka' },
  { key: 'boundary_k_neighbor', label: 'Koonfur — deriska' },
  { key: 'boundary_g_val', label: 'Galbeed — cabbirka' },
  { key: 'boundary_g_neighbor', label: 'Galbeed — deriska' },
  { key: 'built_details', label: 'Faahfaahinta dhismaha', wide: true },
];

// Managed by the interactive map below, not the plain text-field grid above — kept as a
// separate list so saveEdit still persists them even though they're not in `fields`.
const MAP_MANAGED_KEYS: Array<keyof Survey> = ['gps_location', 'polygon_boundary', 'sketch_area', 'sketch_dimensions', 'boundary_label_positions'];

const statusStyle: Record<SurveyStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  'Pending Review': 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  Archived: 'bg-violet-50 text-violet-700 border-violet-200',
};
const subscribeToClient = () => () => {};

export default function SurveyManagementModal({ record, onClose, onChanged }: Props) {
  const { profile } = useAuth();
  const schemaReady = Array.isArray(profile?.permitted_actions);
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const [tab, setTab] = useState<Tab>(schemaReady ? 'workflow' : 'edit');
  const [survey, setSurvey] = useState<Survey>(record);
  const [draft, setDraft] = useState<Partial<Survey>>(record);
  const [revisions, setRevisions] = useState<SurveyRevision[]>([]);
  const [documents, setDocuments] = useState<SurveyDocument[]>([]);
  const [busy, setBusy] = useState(schemaReady);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [category, setCategory] = useState('Ownership');
  const [file, setFile] = useState<File | null>(null);
  const loadedRecordRef = useRef<number | null>(null);

  const isAdmin = profile?.role === 'Admin';
  const can = (action: string) => {
    if (!schemaReady) return action === 'survey.edit' && (isAdmin || Boolean(profile?.permitted_menus?.includes('/records')));
    return isAdmin || Boolean(profile?.permitted_actions?.includes(action));
  };

  async function request(path: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Fadlan dib u gal.');
    const response = await fetch(path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      const overlap = Array.isArray(result.overlaps) && result.overlaps.length
        ? ` ${result.overlaps.map((item: { serial_no: number; owner_name: string }) => `#${item.serial_no} ${item.owner_name}`).join(', ')}`
        : '';
      throw new Error(`${result.error || 'Codsigu wuu fashilmay.'}${overlap}`);
    }
    return result;
  }

  async function load() {
    setBusy(true);
    try {
      const result = await request(`/api/surveys/${record.id}`);
      setSurvey(result.survey);
      setDraft(result.survey);
      setRevisions(result.revisions);
      setDocuments(result.documents);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Xogta lama soo qaadi karin.' });
    } finally {
      setBusy(false);
    }
  }

  // The record id is the lifecycle boundary for this modal request.
  useEffect(() => {
    if (!schemaReady || loadedRecordRef.current === record.id) return;
    loadedRecordRef.current = record.id;
    void load();
    // `load` intentionally follows the record/schema lifecycle only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, schemaReady]);

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await request(`/api/surveys/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      setSurvey(result.survey);
      setDraft(result.survey);
      setMessage({ type: 'success', text: 'Isbeddelka si guul leh ayaa loo kaydiyey.' });
      onChanged();
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Isbeddelku wuu fashilmay.' });
      setBusy(false);
    }
  }

  async function saveEdit() {
    const payload = Object.fromEntries(
      [...fields.map(({ key }) => key), ...MAP_MANAGED_KEYS].map((key) => [key, draft[key] ?? null]),
    );
    if (!schemaReady) {
      setBusy(true);
      setMessage(null);
      const { data, error } = await supabase.from('surveys').update(payload).eq('id', record.id).select('*').single();
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setSurvey(data as Survey);
        setDraft(data as Survey);
        setMessage({ type: 'success', text: 'Isbeddelka si guul leh ayaa loo kaydiyey.' });
        onChanged();
      }
      setBusy(false);
      return;
    }
    await runAction('update', payload);
  }

  async function uploadDocument() {
    if (!file) return setMessage({ type: 'error', text: 'Dooro file-ka aad rabto inaad geliso.' });
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      await request(`/api/surveys/${record.id}/documents`, { method: 'POST', body: form });
      setFile(null);
      setMessage({ type: 'success', text: 'Dukumentiga waa la geliyey.' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'File-ka lama gelin.' });
      setBusy(false);
    }
  }

  async function removeDocument(documentId: number) {
    if (!window.confirm('Ma hubtaa inaad dukumentigan tirtirayso?')) return;
    setBusy(true);
    try {
      await request(`/api/surveys/${record.id}/documents?documentId=${documentId}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: 'Dukumentiga waa la tirtiray.' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Dukumentiga lama tirtirin.' });
      setBusy(false);
    }
  }

  const tabs = useMemo(() => schemaReady ? [
    { id: 'workflow' as Tab, label: 'Ansixinta', icon: ShieldCheck },
    { id: 'edit' as Tab, label: 'Wax ka beddel', icon: Save },
    { id: 'documents' as Tab, label: `Dukumenti (${documents.length})`, icon: FileText },
    { id: 'history' as Tab, label: `Taariikh (${revisions.length})`, icon: History },
  ] : [{ id: 'edit' as Tab, label: 'Wax ka beddel', icon: Save }], [documents.length, revisions.length, schemaReady]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4 md:px-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">Maamulka Survey #{survey.serial_no}</h2>
              {schemaReady && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusStyle[survey.status || 'Draft']}`}>{survey.status || 'Draft'}</span>}
              {schemaReady && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">Version {survey.version || 1}</span>}
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">{survey.owner_name} · {survey.neighborhood}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Xir"><X className="h-5 w-5" /></button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-4 py-2 md:px-7">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${tab === id ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}><Icon className="h-4 w-4" />{label}</button>)}
        </nav>

        <main className="overflow-y-auto p-5 md:p-7">
          {message && <div className={`mb-5 rounded-2xl border p-3 text-xs font-bold ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{message.text}</div>}
          {busy && <div className="mb-4 flex items-center gap-2 text-xs font-bold text-blue-600"><Loader2 className="h-4 w-4 animate-spin" /> Xogta waa la cusboonaysiinayaa...</div>}

          {tab === 'workflow' && <div className="grid gap-5 md:grid-cols-[1fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
              <h3 className="text-sm font-black text-slate-900">Socodka ansixinta</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Draft-ka waa la sixi karaa, kadibna waxaa loo diraa kormeer. Admin-ku wuxuu ansixin ama diidi karaa.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {['Draft', 'Rejected'].includes(survey.status || 'Draft') && can('survey.submit') && <button disabled={busy} onClick={() => runAction('submit')} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" /> U dir kormeer</button>}
                {survey.status === 'Pending Review' && can('survey.approve') && <>
                  <button disabled={busy} onClick={() => runAction('approve')} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white"><CheckCircle2 className="h-4 w-4" /> Ansixi</button>
                  <button disabled={busy} onClick={() => { const reason = window.prompt('Sababta diidmada:'); if (reason) void runAction('reject', { reason }); }} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white"><XCircle className="h-4 w-4" /> Diid</button>
                </>}
                {survey.status === 'Approved' && can('survey.archive') && <button disabled={busy} onClick={() => runAction('archive')} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white"><Archive className="h-4 w-4" /> Kaydi archive</button>}
              </div>
              {survey.rejection_reason && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700"><strong>Sababta diidmada:</strong> {survey.rejection_reason}</div>}
            </div>
            <div className="rounded-3xl border border-slate-200 p-5 text-xs">
              <h3 className="mb-4 font-black text-slate-900">Xogta maamulka</h3>
              <dl className="space-y-3 text-slate-500">
                <div className="flex justify-between gap-3"><dt>Status</dt><dd className="font-black text-slate-800">{survey.status || 'Draft'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Version</dt><dd className="font-black text-slate-800">{survey.version || 1}</dd></div>
                <div className="flex justify-between gap-3"><dt>La cusboonaysiiyey</dt><dd className="font-black text-slate-800">{survey.updated_at ? new Date(survey.updated_at).toLocaleString('so-SO') : '-'}</dd></div>
                <div className="flex justify-between gap-3"><dt>La ansixiyey</dt><dd className="font-black text-slate-800">{survey.approved_at ? new Date(survey.approved_at).toLocaleString('so-SO') : '-'}</dd></div>
              </dl>
            </div>
          </div>}

          {tab === 'edit' && <div>
            {!can('survey.edit') && <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-xs font-bold text-amber-700">Ma lihid survey.edit permission.</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map(({ key, label, wide }) => <label key={key} className={`block ${wide ? 'md:col-span-2' : ''}`}><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{wide ? <textarea rows={3} value={String(draft[key] ?? '')} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white" /> : <input value={String(draft[key] ?? '')} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white" />}</label>)}
            </div>

            <div className="mt-5">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Maabka &amp; Soohdinta (Map &amp; Boundary)</span>
              <MiniMap
                gpsValue={String(draft.gps_location ?? '')}
                onGpsChange={(value) => setDraft((prev) => ({ ...prev, gps_location: value }))}
                polygonValue={String(draft.polygon_boundary ?? '')}
                onPolygonChange={(value) => setDraft((prev) => ({ ...prev, polygon_boundary: value }))}
                labelPositionsValue={String(draft.boundary_label_positions ?? '')}
                onLabelPositionsChange={(value) => setDraft((prev) => ({ ...prev, boundary_label_positions: value }))}
                boundaryInfo={{
                  N: { val: draft.boundary_w_val, neighbor: draft.boundary_w_neighbor },
                  E: { val: draft.boundary_b_val, neighbor: draft.boundary_b_neighbor },
                  S: { val: draft.boundary_k_val, neighbor: draft.boundary_k_neighbor },
                  W: { val: draft.boundary_g_val, neighbor: draft.boundary_g_neighbor },
                } as BoundaryInfo}
                onSketchDetailsChange={(value) => setDraft((prev) => ({
                  ...prev,
                  sketch_dimensions: value || undefined,
                  sketch_area: value.split(' | ')[0]?.replace(/Area:|Area/gi, '').trim() || undefined,
                }))}
              />
            </div>

            <button disabled={busy || !can('survey.edit')} onClick={saveEdit} className="mt-5 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black text-white disabled:opacity-40"><Save className="h-4 w-4" /> Kaydi isbeddelka</button>
          </div>}

          {tab === 'documents' && <div className="space-y-5">
            {can('survey.edit') && <div className="grid gap-3 rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 p-5 md:grid-cols-[160px_1fr_auto] md:items-end">
              <label className="text-[10px] font-black uppercase text-slate-500">Nooca<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800"><option>Ownership</option><option>ID</option><option>Survey Plan</option><option>Receipt</option><option>Other</option></select></label>
              <label className="text-[10px] font-black uppercase text-slate-500">File (PDF/Image, max 10 MB)<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" /></label>
              <button disabled={busy || !file} onClick={uploadDocument} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white disabled:opacity-40"><Upload className="h-4 w-4" /> Geli</button>
            </div>}
            <div className="grid gap-3">
              {documents.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500">Weli dukumenti laguma darin.</p>}
              {documents.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"><div className="min-w-0"><a href={document.signed_url} target="_blank" rel="noreferrer" className="block truncate text-sm font-black text-blue-700 hover:underline">{document.name}</a><p className="mt-1 text-[10px] font-bold text-slate-400">{document.category} · {(document.size_bytes / 1024).toFixed(1)} KB · {new Date(document.created_at).toLocaleDateString('so-SO')}</p></div>{can('survey.edit') && <button onClick={() => removeDocument(document.id)} className="rounded-xl p-2 text-rose-500 hover:bg-rose-50" aria-label="Tirtir"><Trash2 className="h-4 w-4" /></button>}</div>)}
            </div>
          </div>}

          {tab === 'history' && <div className="space-y-3">
            {revisions.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-xs text-slate-500">Audit history ma jiro.</p>}
            {revisions.map((revision) => <div key={revision.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-slate-100 p-2 text-slate-500"><Clock3 className="h-4 w-4" /></span><div><p className="text-xs font-black text-slate-900">Version {revision.version} · {revision.action}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{revision.notes || 'Isbeddel survey'} · {new Date(revision.created_at).toLocaleString('so-SO')}</p></div></div>{can('survey.edit') && revision.action !== 'Created' && <button disabled={busy} onClick={() => { if (window.confirm(`Ma soo celisaa version ${revision.version}?`)) void runAction('restore_revision', { revision_id: revision.id }); }} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Soo celi</button>}</div>)}
          </div>}
        </main>
      </section>
    </div>, document.body,
  );
}

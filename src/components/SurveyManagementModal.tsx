'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { canAction } from '@/lib/permissions';
import { useSettings } from '@/context/SettingsContext';
import type { Survey, SurveyDocument, SurveyRevision, SurveyStatus } from '@/types';
import { Clock3, FileText, History, Loader2, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react';
import SurveyFormFields from '@/components/SurveyFormFields';

type Tab = 'edit' | 'workflow' | 'documents' | 'history';
export type SurveyChange =
  | { type: 'updated'; survey: Survey }
  | { type: 'deleted'; surveyId: number };

type Props = { record: Survey; onClose: () => void; onChanged: (change: SurveyChange) => void | Promise<void> };

const fields: Array<keyof Survey> = [
  'owner_name', 'land_type', 'neighborhood', 'branch', 'vicinity',
  'boundary_w_val', 'boundary_w_neighbor', 'boundary_b_val', 'boundary_b_neighbor',
  'boundary_k_val', 'boundary_k_neighbor', 'boundary_g_val', 'boundary_g_neighbor',
  'built_details',
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
  const { settings } = useSettings();
  const schemaReady = Array.isArray(profile?.permitted_actions);
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const [tab, setTab] = useState<Tab>('edit');
  const [survey, setSurvey] = useState<Survey>(record);
  const [draft, setDraft] = useState<Partial<Survey>>(record);
  const [revisions, setRevisions] = useState<SurveyRevision[]>([]);
  const [documents, setDocuments] = useState<SurveyDocument[]>([]);
  const [busy, setBusy] = useState(schemaReady);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const loadedRecordRef = useRef<number | null>(null);

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'SuperAdmin';
  const can = (action: string) => canAction(profile, action);

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
        ? ` ${result.overlaps.map((item: { serial_no: number; owner_name: string }) => `${item.serial_no} ${item.owner_name}`).join(', ')}`
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
      await onChanged({ type: 'updated', survey: result.survey as Survey });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Isbeddelku wuu fashilmay.' });
      setBusy(false);
    }
  }

  async function saveEdit() {
    const payload = Object.fromEntries(
      [...fields, ...MAP_MANAGED_KEYS].map((key) => [key, draft[key] ?? null]),
    );
    if (!schemaReady) {
      setBusy(true);
      setMessage(null);
      const { data, error } = await supabase.from('surveys').update(payload).eq('id', record.id).select('*').single();
      if (error) {
        setMessage({ type: 'error', text: error.message });
        setBusy(false);
      } else {
        setSurvey(data as Survey);
        setDraft(data as Survey);
        await onChanged({ type: 'updated', survey: data as Survey });
        setBusy(false);
        onClose();
      }
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await request(`/api/surveys/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', ...payload }),
      });
      setSurvey(result.survey);
      setDraft(result.survey);
      await onChanged({ type: 'updated', survey: result.survey as Survey });
      setBusy(false);
      onClose();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Isbeddelku wuu fashilmay.' });
      setBusy(false);
    }
  }

  async function uploadDocument() {
    if (!file) return setMessage({ type: 'error', text: 'Dooro file-ka aad rabto inaad geliso.' });
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', file.type.startsWith('image/') ? 'Image' : 'Document');
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

  async function deleteSurvey() {
    if (!window.confirm(`Ma hubtaa inaad tirtirto Survey ${survey.survey_no || survey.serial_no} (${survey.owner_name})? Tallaabadan lama soo celin karo — dukumentiyada iyo taariikhda oo dhanba way la tirmi doonaan.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await request(`/api/surveys/${record.id}`, { method: 'DELETE' });
      await onChanged({ type: 'deleted', surveyId: record.id });
      onClose();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Survey-ga lama tirtirin.' });
      setBusy(false);
    }
  }

  const tabs = useMemo(() => schemaReady ? [
    { id: 'edit' as Tab, label: 'Wax ka beddel', icon: Save },
    { id: 'documents' as Tab, label: `Dukumenti (${documents.length})`, icon: FileText },
    { id: 'history' as Tab, label: `Taariikh (${revisions.length})`, icon: History },
  ] : [{ id: 'edit' as Tab, label: 'Wax ka beddel', icon: Save }], [documents.length, revisions.length, schemaReady]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between md:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 truncate">Maamulka Survey {survey.survey_no || survey.serial_no}</h2>
              {schemaReady && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusStyle[survey.status || 'Draft']}`}>{survey.status || 'Draft'}</span>}
              {schemaReady && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">Version {survey.version || 1}</span>}
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500 truncate">{survey.owner_name} · {survey.neighborhood}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                onClick={deleteSurvey}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" /> Tirtir
              </button>
            )}
            <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Xir"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-4 py-2 md:px-7">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${tab === id ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}><Icon className="h-4 w-4" />{label}</button>)}
        </nav>

        <main className="overflow-y-auto p-5 md:p-7">
          {message && <div className={`mb-5 rounded-2xl border p-3 text-xs font-bold ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{message.text}</div>}
          {busy && <div className="mb-4 flex items-center gap-2 text-xs font-bold text-blue-600"><Loader2 className="h-4 w-4 animate-spin" /> Xogta waa la cusboonaysiinayaa...</div>}

          {tab === 'edit' && <div>
            {!can('survey.edit') && <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-xs font-bold text-amber-700">Ma lihid survey.edit permission.</p>}
            <fieldset disabled={!can('survey.edit')} className="disabled:opacity-60">
              <SurveyFormFields
                draft={draft}
                onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
                landTypes={settings.land_types}
              />
            </fieldset>

            {can('survey.edit') && <button disabled={busy} onClick={saveEdit} className="mt-5 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black text-white disabled:opacity-40"><Save className="h-4 w-4" /> Kaydi isbeddelka</button>}
          </div>}

          {tab === 'documents' && <div className="space-y-5">
            {can('survey.edit') && <div className="grid gap-3 rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 p-5 md:grid-cols-[1fr_auto] md:items-end">
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

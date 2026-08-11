'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import {
  Cloud,
  Info,
  Loader2,
  Pencil,
  Plus,
  PowerOff,
  Power,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react';

type Connection = { id: number; name: string; rootFolderId: string; createdAt: string; isActive?: boolean };
type IndexStatus = { count: number; lastIndexedAt: string | null };
type SyncProgress = { totalLive: number; totalPending: number; processedThisBatch: number; removedThisBatch: number; done: boolean };
type WatchStatusInfo = { active: boolean; expiresAt: string | null };

async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Authentication token is missing. Please log in again.');
  return fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

function ConnectionForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Connection | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { showAlert } = useModal();
  const [name, setName] = useState(initial?.name || '');
  const [clientEmail, setClientEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [rootFolderId, setRootFolderId] = useState(initial?.rootFolderId || '');
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rootFolderId.trim() || (!isEdit && (!clientEmail.trim() || !privateKey.trim()))) {
      showAlert('Cillad', 'Fadlan buuxi meelaha loo baahan yahay.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = { name: name.trim(), rootFolderId: rootFolderId.trim() };
      if (clientEmail.trim()) payload.clientEmail = clientEmail.trim();
      if (privateKey.trim()) payload.privateKey = privateKey.trim();

      const response = initial
        ? await authenticatedFetch(`/api/drive-connections/${initial.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await authenticatedFetch('/api/drive-connections', { method: 'POST', body: JSON.stringify(payload) });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lama kaydin karin.');
      onSaved();
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Lama kaydin karin.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Magaca xidhiidhka</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tusaale: Xafiiska Baydhabo"
          className="w-full rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Service account email</label>
        <input
          type="text"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          placeholder={isEdit ? 'Ka bannaan ka dhig si aad u ilaaliso mid hore' : 'drive-search-bot@...iam.gserviceaccount.com'}
          className="w-full rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Furaha sirta ah (private key)</label>
        <textarea
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          rows={4}
          placeholder={isEdit ? 'Ka bannaan ka dhig si aad u ilaaliso furihii hore' : '-----BEGIN PRIVATE KEY-----...'}
          className="w-full rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Root Folder ID</label>
        <input
          type="text"
          value={rootFolderId}
          onChange={(e) => setRootFolderId(e.target.value)}
          placeholder="1-3YLIQdaEThxkZAp23VoedAb5cXTs-ie"
          className="w-full rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white cursor-pointer">
          Ka noqo
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2 cursor-pointer transition-colors disabled:opacity-60"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Kaydi
        </button>
      </div>
    </form>
  );
}

export default function DriveConnectionsPanel() {
  const { showAlert, showConfirm } = useModal();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [indexStatus, setIndexStatus] = useState<Record<number, IndexStatus>>({});
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncNote, setSyncNote] = useState<Record<number, string>>({});
  const [watchStatus, setWatchStatus] = useState<Record<number, WatchStatusInfo>>({});
  const [watchBusyId, setWatchBusyId] = useState<number | null>(null);

  const loadStatus = async (id: number) => {
    try {
      const response = await authenticatedFetch(`/api/drive-connections/${id}/sync`);
      const result = await response.json();
      if (response.ok) setIndexStatus((prev) => ({ ...prev, [id]: result.status }));
    } catch {
      // Index status is informational only — a failed lookup shouldn't block the panel.
    }
  };

  const loadWatchStatus = async (id: number) => {
    try {
      const response = await authenticatedFetch(`/api/drive-connections/${id}/watch`);
      const result = await response.json();
      if (response.ok) setWatchStatus((prev) => ({ ...prev, [id]: result.status }));
    } catch {
      // Informational only — a failed lookup shouldn't block the panel.
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/drive-connections');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lama soo qaadi karin.');
      const list: Connection[] = result.connections || [];
      setConnections(list);
      list.forEach((c) => { void loadStatus(c.id); void loadWatchStatus(c.id); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lama soo qaadi karin.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableWatch = async (conn: Connection) => {
    setWatchBusyId(conn.id);
    try {
      const response = await authenticatedFetch(`/api/drive-connections/${conn.id}/watch`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Live Sync lama shaqaysiin karin.');
      setWatchStatus((prev) => ({ ...prev, [conn.id]: result.status }));
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Live Sync lama shaqaysiin karin.', 'error');
    } finally {
      setWatchBusyId(null);
    }
  };

  // Several sync requests run concurrently per round instead of one at a time — each
  // one is a separate server invocation with its own time budget, so N at once gets
  // roughly N times the documents through per round instead of serializing them.
  const SYNC_CONCURRENCY = 4;
  const SYNC_MAX_ROUNDS = 2000;

  const handleSync = async (conn: Connection) => {
    setSyncingId(conn.id);
    setSyncNote((prev) => ({ ...prev, [conn.id]: 'Bilaabaya isku-dheelitirka...' }));
    try {
      let totalProcessed = 0;
      for (let round = 0; round < SYNC_MAX_ROUNDS; round++) {
        const responses = await Promise.all(
          Array.from({ length: SYNC_CONCURRENCY }, () => authenticatedFetch(`/api/drive-connections/${conn.id}/sync`, { method: 'POST' })),
        );
        const bodies = await Promise.all(responses.map((r) => r.json()));

        let roundProcessed = 0;
        let minPending = Infinity;
        let firstError: string | null = null;
        for (let i = 0; i < responses.length; i++) {
          if (!responses[i].ok) { firstError = firstError || bodies[i]?.error || 'Isku-dheelitirku wuu fashilmay.'; continue; }
          const progress: SyncProgress = bodies[i].progress;
          roundProcessed += progress.processedThisBatch;
          minPending = Math.min(minPending, progress.totalPending);
        }
        if (firstError && roundProcessed === 0) throw new Error(firstError);

        totalProcessed += roundProcessed;
        const remaining = minPending === Infinity ? 0 : minPending;
        setSyncNote((prev) => ({
          ...prev,
          [conn.id]: remaining <= 0 ? 'Dhammaystiray, cusboonaysiinaya...' : `${totalProcessed} la keydiyay, ~${remaining} ka hadhay...`,
        }));
        if (remaining <= 0) break;
      }
      await loadStatus(conn.id);
      setSyncNote((prev) => ({ ...prev, [conn.id]: '' }));
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Isku-dheelitirku wuu fashilmay.', 'error');
      setSyncNote((prev) => ({ ...prev, [conn.id]: '' }));
    } finally {
      setSyncingId(null);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);

  const handleDelete = async (conn: Connection) => {
    const confirmed = await showConfirm(
      'Xaqiiji Tirtiridda',
      `Ma hubaal ayaad tahay inaad tirtirto xidhiidhka "${conn.name}"?`,
      'Haa',
      'Maya',
    );
    if (!confirmed) return;
    setBusyId(conn.id);
    try {
      const response = await authenticatedFetch(`/api/drive-connections/${conn.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lama tirtiri karin.');
      await load();
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Lama tirtiri karin.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (conn: Connection) => {
    setBusyId(conn.id);
    try {
      const response = await authenticatedFetch(`/api/drive-connections/${conn.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !(conn.isActive ?? true) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lama cusboonaysiin karin.');
      await load();
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Lama cusboonaysiin karin.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800">Xidhiidhyada Google Drive</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ku dar hal ama dhowr xidhiidh oo Google Drive ah — mid kasta oo leh service account iyo folder gaarkiisa ah.
            </p>
          </div>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => { setShowAddForm(true); setEditingId(null); }}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 cursor-pointer transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Xidhiidh Cusub
            </button>
          )}
        </div>

        <div className="flex gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-xs text-slate-600 leading-relaxed">
          <Info className="h-4 w-4 shrink-0 text-teal-600 mt-0.5" />
          <div className="space-y-1.5">
            <p className="font-bold text-slate-700">Sida loo helo Service account email, Private key, iyo Root Folder ID:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Tag <span className="font-mono">console.cloud.google.com</span>, abuur ama dooro project, kadibna hubi in <span className="font-semibold">Google Drive API</span> la shaqaysiiyay (Enabled).</li>
              <li>Aad <span className="font-semibold">IAM &amp; Admin → Service Accounts → Create Service Account</span>, magac u dhig, kadibna abuur.</li>
              <li>Xidhiidhka service account-ka fur tabka <span className="font-semibold">Keys → Add Key → Create new key → JSON</span>, oo soo deji faylka. Fayl-kan waxaa ku jira <span className="font-mono">client_email</span> (waa Service account email-ka) iyo <span className="font-mono">private_key</span> (waa Furaha sirta ah — koobiyee dhammaan qoraalka intii u dhaxeysay <span className="font-mono">-----BEGIN PRIVATE KEY-----</span> iyo <span className="font-mono">-----END PRIVATE KEY-----</span>).</li>
              <li>Tag Google Drive, furfolderka aad rabto in la raadiyo/la eego, kadibna la wadaag (Share) email-ka service account-ka (client_email) sida <span className="font-semibold">Viewer</span>.</li>
              <li>Root Folder ID waa qaybta ku jirta URL-ka folder-ka — tusaale: <span className="font-mono">drive.google.com/drive/folders/<span className="text-teal-700">1-3YLIQdaEThxkZAp23VoedAb5cXTs-ie</span></span>, qaybta la calaamadeeyay ayaa ah ID-ga.</li>
            </ol>
          </div>
        </div>

        {showAddForm && (
          <ConnectionForm
            initial={null}
            onCancel={() => setShowAddForm(false)}
            onSaved={() => { setShowAddForm(false); void load(); }}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Soo raraya...</span>
          </div>
        ) : error ? (
          <p className="text-sm font-bold text-rose-600 py-4">{error}</p>
        ) : connections.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Cloud className="h-7 w-7 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">Wali xidhiidh lama darin.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {connections.map((conn) => (
              <div key={conn.id}>
                {editingId === conn.id ? (
                  <ConnectionForm
                    initial={conn}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); void load(); }}
                  />
                ) : (
                  <div className="rounded-2xl border border-slate-200 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${conn.isActive === false ? 'bg-slate-100 text-slate-400' : 'bg-teal-50 text-teal-600'}`}>
                        <Cloud className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {conn.name}
                          {conn.isActive === false && <span className="ml-2 text-[10px] font-bold uppercase text-slate-400">(damiyay)</span>}
                        </p>
                        <p className="truncate text-[11px] font-mono text-slate-400">{conn.rootFolderId}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(conn)}
                        disabled={busyId === conn.id}
                        title={conn.isActive === false ? 'Shaqaysii' : 'Damin'}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                      >
                        {conn.isActive === false ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(conn.id); setShowAddForm(false); }}
                        title="Wax ka beddel"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(conn)}
                        disabled={busyId === conn.id}
                        title="Tirtir"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-rose-500 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2">
                      <div className="min-w-0 flex-1 text-[11px] font-semibold text-slate-500">
                        {syncingId === conn.id && syncNote[conn.id] ? (
                          <span className="flex items-center gap-1.5 text-teal-700"><Loader2 className="h-3 w-3 animate-spin shrink-0" /> {syncNote[conn.id]}</span>
                        ) : indexStatus[conn.id] ? (
                          indexStatus[conn.id].count > 0 ? (
                            <span>
                              {indexStatus[conn.id].count} dukumintiyood oo keydsan (raadin degdeg ah) — cusboonaysiintii ugu dambeysay: {indexStatus[conn.id].lastIndexedAt ? new Date(indexStatus[conn.id].lastIndexedAt as string).toLocaleString() : '—'}
                            </span>
                          ) : (
                            <span className="text-amber-600">Wali lama isku-dheelitirin — Macmiisha waxay ku raadin doontaa Drive toos ah (gaabis).</span>
                          )
                        ) : (
                          <span>Xaaladda keydka...</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSync(conn)}
                        disabled={syncingId === conn.id}
                        title="Isku-dheelitir keydka raadinta"
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <RefreshCw className={`h-3 w-3 ${syncingId === conn.id ? 'animate-spin' : ''}`} /> Sync Now
                      </button>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2">
                      <div className="min-w-0 flex-1 text-[11px] font-semibold text-slate-500">
                        {watchStatus[conn.id]?.active ? (
                          <span className="flex items-center gap-1.5 text-emerald-700">
                            <Zap className="h-3 w-3 shrink-0 fill-current" /> Live Sync waa shaqaynayaa — fayl cusub wuxuu ku soo biiraa keydka sekondo gudahood. Cusboonaysiinaya ilaa: {watchStatus[conn.id]?.expiresAt ? new Date(watchStatus[conn.id].expiresAt as string).toLocaleString() : '—'}
                          </span>
                        ) : (
                          <span>Live Sync wuu damanyahay — fayl cusub wuxuu u baahan yahay Sync Now gacanta lagu riixo.</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnableWatch(conn)}
                        disabled={watchBusyId === conn.id}
                        title={watchStatus[conn.id]?.active ? 'Cusboonaysii Live Sync' : 'Shaqaysii Live Sync'}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-50 shrink-0 transition-colors ${
                          watchStatus[conn.id]?.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                      >
                        {watchBusyId === conn.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        {watchStatus[conn.id]?.active ? 'Cusboonaysii' : 'Shaqaysii Live Sync'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

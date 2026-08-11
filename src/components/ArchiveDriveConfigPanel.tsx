'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { Archive, Info, Loader2, Save } from 'lucide-react';

type ConfigSummary = { configured: boolean; scriptUrl: string | null; rootFolderId: string | null };

async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Authentication token is missing. Please log in again.');
  return fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

const APPS_SCRIPT_SOURCE = `const FOLDER_ID = 'KU BEDEL FOLDER ID-GAAGA';
const SHARED_SECRET = 'KU BEDEL SECRET-KAAGA';

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SHARED_SECRET) {
    return json_({ error: 'Unauthorized' });
  }
  try {
    if (body.action === 'upload') {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const bytes = Utilities.base64Decode(body.contentBase64);
      const blob = Utilities.newBlob(bytes, 'application/pdf', body.fileName);
      const file = folder.createFile(blob);
      return json_({ fileId: file.getId(), webViewLink: file.getUrl() });
    }
    if (body.action === 'download') {
      const file = DriveApp.getFileById(body.fileId);
      const contentBase64 = Utilities.base64Encode(file.getBlob().getBytes());
      return json_({ contentBase64: contentBase64, fileName: file.getName() });
    }
    if (body.action === 'delete') {
      DriveApp.getFileById(body.fileId).setTrashed(true);
      return json_({ ok: true });
    }
    return json_({ error: 'Unknown action' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;

export default function ArchiveDriveConfigPanel() {
  const { showAlert } = useModal();
  const [summary, setSummary] = useState<ConfigSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scriptUrl, setScriptUrl] = useState('');
  const [sharedSecret, setSharedSecret] = useState('');
  const [rootFolderId, setRootFolderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/document-archive/config');
      const result = await response.json();
      if (response.ok) {
        setSummary(result.config);
        setRootFolderId(result.config.rootFolderId || '');
        setScriptUrl(result.config.scriptUrl || '');
      }
    } catch {
      // Non-fatal — the form below still works for a first-time save.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_SOURCE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; nothing useful to recover here.
    }
  };

  const handleSave = async () => {
    if (!scriptUrl.trim() || !sharedSecret.trim() || !rootFolderId.trim()) {
      showAlert('Cillad', 'Fadlan buuxi dhammaan meelaha.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await authenticatedFetch('/api/document-archive/config', {
        method: 'PUT',
        body: JSON.stringify({ scriptUrl: scriptUrl.trim(), sharedSecret: sharedSecret.trim(), rootFolderId: rootFolderId.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lama kaydin karin.');
      showAlert('Guul', 'Xidhiidhka Document Archive waa la kaydiyey!', 'success');
      await load();
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Lama kaydin karin.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-4 shadow-sm">
      <div>
        <h3 className="text-sm font-black text-slate-800">Google Drive ee Document Archive</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          PDF-yada scan-ka ah ee References-ka waxaa lagu kaydiyaa Google account-kaaga gaarka ah, adigoo isticmaalaya Google Apps Script (halkii Service Account, si loo isticmaalo kaydka (quota) dhabta ah ee account-kaaga).
        </p>
      </div>

      <div className="flex gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-xs text-slate-600 leading-relaxed">
        <Info className="h-4 w-4 shrink-0 text-teal-600 mt-0.5" />
        <div className="space-y-1.5 w-full">
          <p className="font-bold text-slate-700">Talaabooyinka deployment-ka (hal mar oo kaliya):</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Google account-kaaga cusub, tag <span className="font-mono">script.google.com</span> → New project.</li>
            <li>Tirtir qoraalka default-ka ah, ku dhaji qoraalka hoose (riix &quot;Koobiyee&quot;), kadibna ku beddel <span className="font-mono">FOLDER_ID</span> iyo <span className="font-mono">SHARED_SECRET</span>.</li>
            <li><span className="font-semibold">Deploy → New deployment → Web app</span>: Execute as = <span className="font-semibold">Me</span>, Who has access = <span className="font-semibold">Anyone</span>. Riix Deploy, kadibna oggolow (authorize) marka lagu weydiiyo.</li>
            <li>Koobiyee URL-ka Web app ee la siiyay (wuxuu ku dhamaadaa <span className="font-mono">/exec</span>) — ku dheji &quot;Script URL&quot; hoose.</li>
          </ol>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleCopyScript}
              className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-[11px] font-bold text-teal-700 hover:bg-teal-50 cursor-pointer"
            >
              {copied ? 'La koobiyeeyay!' : 'Koobiyee qoraalka Apps Script'}
            </button>
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-slate-900 p-3 text-[10px] leading-relaxed text-slate-100 font-mono whitespace-pre-wrap">{APPS_SCRIPT_SOURCE}</pre>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">Soo raraya...</span>
        </div>
      ) : (
        <>
          {summary?.configured && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <Archive className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">Diyaar</p>
                <p className="truncate text-[11px] font-mono text-slate-500">{summary.scriptUrl}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Script URL (ku dhamaada /exec)</label>
              <input
                type="text"
                value={scriptUrl}
                onChange={(e) => setScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Shared Secret (isla midka SHARED_SECRET ee qoraalka)</label>
              <input
                type="text"
                value={sharedSecret}
                onChange={(e) => setSharedSecret(e.target.value)}
                placeholder="ku qor secret-ka aad qoraalka ku dhex geliyey"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Root Folder ID (isla midka FOLDER_ID)</label>
              <input
                type="text"
                value={rootFolderId}
                onChange={(e) => setRootFolderId(e.target.value)}
                placeholder="1HSJNT5A20Xo_F_KgdPNsIslWAr6YFZ1W"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 px-5 py-2.5 text-xs font-bold text-white shadow-md cursor-pointer transition-all"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydi
            </button>
          </div>
        </>
      )}
    </div>
  );
}

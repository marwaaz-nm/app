'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Reference } from '@/types';
import { useModal } from '@/context/ModalContext';
import { compressPdfToLimit } from '@/lib/pdfCompress';
import { ListLoadingSkeleton } from '@/components/Skeleton';
import {
  Archive,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';

const LIST_FIELDS = 'id, ref_number, subject, status, issue_date, archive_drive_file_id, archive_file_name, archive_uploaded_at';
const PAGE_SIZE = 100;
// Matches the server's own cap (see the two upload API routes) — checked client-side
// first so an oversized PDF gets compressed automatically instead of round-tripping to
// the server just to be rejected.
const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Fadlan dib u gal.');
  return session.access_token;
}

export default function DocumentArchivePage() {
  const { showAlert } = useModal();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [compressingId, setCompressingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkCompressing, setBulkCompressing] = useState(false);

  // Reloads whatever's currently on screen — the default full list, or the active
  // search — so results stay in sync after an upload without losing the user's context.
  const reload = async (raw: string) => {
    const trimmed = raw.trim();
    setLoading(true);
    setSelectedIds([]);
    try {
      let builder = supabase.from('references').select(LIST_FIELDS).order('created_at', { ascending: false });
      builder = trimmed ? builder.ilike('ref_number', `%${trimmed}%`) : builder.limit(PAGE_SIZE);
      const { data, error } = await builder;
      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Lama soo qaadi karin.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void reload(''), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void reload(query), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleUpload = async (reference: Reference, file: File) => {
    if (file.type !== 'application/pdf') {
      showAlert('Cillad', 'Kaliya faylasha PDF ayaa la ogol yahay.', 'error');
      return;
    }
    setUploadingId(reference.id);
    try {
      let uploadFile = file;
      if (file.size > MAX_UPLOAD_BYTES) {
        setCompressingId(reference.id);
        uploadFile = await compressPdfToLimit(file, MAX_UPLOAD_BYTES);
        setCompressingId(null);
        if (uploadFile.size > MAX_UPLOAD_BYTES) {
          showAlert('Cillad', 'PDF-kan aad u weyn buu yahay — xitaa markii la yareeyay wuu ka sii weyn yahay 1 MB. Fadlan isticmaal fayl ka yar ama dhowr bog u qaybi.', 'error');
          return;
        }
      }
      const token = await accessToken();
      const formData = new FormData();
      formData.append('referenceId', String(reference.id));
      formData.append('file', uploadFile);
      const response = await fetch('/api/document-archive/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload-ku wuu fashilmay.');
      showAlert('Guul', 'PDF-ka waa la keydiyey!', 'success');
      await reload(query);
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Upload-ku wuu fashilmay.', 'error');
    } finally {
      setUploadingId(null);
      setCompressingId(null);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === results.length ? [] : results.map((r) => r.id)));
  };

  // Links one uploaded PDF to every currently selected reference — for cases where a
  // single scanned document (e.g. one contract) actually covers several references,
  // instead of uploading the same file over and over per reference.
  const handleBulkUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      showAlert('Cillad', 'Kaliya faylasha PDF ayaa la ogol yahay.', 'error');
      return;
    }
    setBulkUploading(true);
    try {
      let uploadFile = file;
      if (file.size > MAX_UPLOAD_BYTES) {
        setBulkCompressing(true);
        uploadFile = await compressPdfToLimit(file, MAX_UPLOAD_BYTES);
        setBulkCompressing(false);
        if (uploadFile.size > MAX_UPLOAD_BYTES) {
          showAlert('Cillad', 'PDF-kan aad u weyn buu yahay — xitaa markii la yareeyay wuu ka sii weyn yahay 1 MB. Fadlan isticmaal fayl ka yar ama dhowr bog u qaybi.', 'error');
          return;
        }
      }
      const token = await accessToken();
      const formData = new FormData();
      formData.append('referenceIds', JSON.stringify(selectedIds));
      formData.append('file', uploadFile);
      const response = await fetch('/api/document-archive/upload-batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload-ku wuu fashilmay.');
      showAlert('Guul', `PDF-ka waa lagu daray ${result.linkedCount} reference.`, 'success');
      setSelectedIds([]);
      await reload(query);
    } catch (err) {
      showAlert('Cillad', err instanceof Error ? err.message : 'Upload-ku wuu fashilmay.', 'error');
    } finally {
      setBulkUploading(false);
      setBulkCompressing(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Document Archive</h1>
        <p className="text-sm text-slate-500">
          Ku dar ama beddel PDF-ka scan-ka ah ee Reference kasta. Dadka QR code-ka scan garaya waxay ka soo dejisan karaan PDF-kan.
        </p>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Raadi Reference number... (banaan ka dhig si aad u aragto dhammaan)"
            className="w-full bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl py-2.5 md:py-3.5 pl-10 md:pl-11 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Tirtir raadinta"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!loading && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">
              {query ? `Natiijooyinka "${query}" (${results.length})` : `Dhammaan References-ka ugu dambeeyay (${results.length})`}
            </p>
            {results.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-500">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === results.length}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < results.length;
                  }}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Dooro dhammaan
              </label>
            )}
          </div>
        )}
      </div>

      {/* Bulk-share action bar: link one PDF to every currently selected reference at
          once, for cases where a single scanned document actually covers several
          references. */}
      {selectedIds.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/90 p-3.5 shadow-md backdrop-blur-md md:p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-teal-800">{selectedIds.length} reference oo la doortay</p>
            <p className="text-[10px] font-semibold text-teal-700/80">Ku dar hal PDF oo ay dhammaantood wadaagaan.</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="rounded-lg px-2 py-1 text-[10px] font-bold text-teal-700 hover:bg-teal-100"
          >
            Ka noqo
          </button>
          <label className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-bold transition-colors ${
            bulkUploading ? 'border-teal-200 bg-white text-teal-300' : 'border-teal-300 bg-white text-teal-700 hover:bg-teal-100'
          }`}>
            {bulkUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {bulkCompressing ? 'Yareynta PDF...' : 'Ku dar hal PDF'}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={bulkUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleBulkUpload(file);
              }}
            />
          </label>
        </div>
      )}

      {loading ? (
        <ListLoadingSkeleton rows={5} />
      ) : results.length === 0 ? (
        <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-10 flex flex-col items-center gap-2 text-center">
          <Archive className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">Wax reference ah lama helin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((reference) => (
            <div key={reference.id} className={`bg-white border rounded-2xl p-4 flex items-center gap-3 transition-colors ${selectedIds.includes(reference.id) ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200/60'}`}>
              <input
                type="checkbox"
                checked={selectedIds.includes(reference.id)}
                onChange={() => toggleSelected(reference.id)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                aria-label={`Dooro ${reference.ref_number}`}
              />
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${reference.archive_drive_file_id ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {reference.archive_drive_file_id ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{reference.ref_number} — {reference.subject}</p>
                <p className="truncate text-xs text-slate-500">
                  {reference.archive_drive_file_id
                    ? `PDF la keydiyey: ${reference.archive_file_name} — ${reference.archive_uploaded_at ? new Date(reference.archive_uploaded_at).toLocaleString() : ''}`
                    : 'Weli PDF lama darin.'}
                </p>
              </div>
              <label className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer shrink-0 transition-colors ${
                uploadingId === reference.id ? 'border-slate-200 text-slate-400' : 'border-slate-200 text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700'
              }`}>
                {uploadingId === reference.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {compressingId === reference.id ? 'Yareynta PDF...' : reference.archive_drive_file_id ? 'Beddel PDF' : 'Ku dar PDF'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={uploadingId !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleUpload(reference, file);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

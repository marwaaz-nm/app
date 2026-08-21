'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ListLoadingSkeleton } from '@/components/Skeleton';
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  FolderClosed,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  X,
} from 'lucide-react';

type DriveItem = {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
};

type ConnectionSummary = { id: number; name: string };
type Quota = { usageBytes: number };
type BrowseResponse = { mode: 'browse'; folderId: string; path: { id: string; name: string }[]; items: DriveItem[] };
type SearchResponse = { mode: 'search'; query: string; items: DriveItem[] };
type SortKey = 'name-asc' | 'name-desc' | 'date-desc' | 'date-oldest';
type ViewMode = 'list' | 'grid';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name-asc', label: 'Magac (A-Z)' },
  { value: 'name-desc', label: 'Magac (Z-A)' },
  { value: 'date-desc', label: 'Taariikhda ugu dambeysay' },
  { value: 'date-oldest', label: 'Taariikhda ugu horeysay' },
];

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Fadlan dib u gal.');
  return session.access_token;
}

function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

// What kind of in-app viewer (if any) a file's mime type supports — everything else
// falls back to opening Google's own webViewLink in a new tab.
function previewKind(mimeType: string): 'pdf' | 'image' | 'video' | 'audio' | null {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const kind = previewKind(mimeType);
  if (kind === 'pdf') return <FileText className={className} />;
  if (kind === 'image') return <FileImage className={className} />;
  if (kind === 'video') return <FileVideo className={className} />;
  if (kind === 'audio') return <FileAudio className={className} />;
  return <File className={className} />;
}

function sortItems(items: DriveItem[], sortKey: SortKey): DriveItem[] {
  const compare = (a: DriveItem, b: DriveItem) => {
    switch (sortKey) {
      case 'name-desc':
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
      case 'date-desc':
        return (b.modifiedTime || '').localeCompare(a.modifiedTime || '');
      case 'date-oldest':
        return (a.modifiedTime || '').localeCompare(b.modifiedTime || '');
      case 'name-asc':
      default:
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
  };
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return compare(a, b);
  });
}

export default function DriveFilesPage() {
  // Connection picker state
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [quotas, setQuotas] = useState<Record<number, Quota | 'loading' | 'error' | undefined>>({});

  // Browsing/search state, scoped to whichever connection is selected
  const [folderId, setFolderId] = useState<string | null>(null);
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // In-app preview (PDF/image/video/audio) instead of forcing a download for these types.
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Manual correction for photos whose orientation the browser can't infer (no EXIF tag,
  // or the pixels themselves were saved rotated) — CSS-level auto-correction has nothing
  // to read in that case, so a rotate button is the only reliable fix.
  const [previewRotation, setPreviewRotation] = useState(0);

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);
    setConnectionsError(null);
    try {
      const token = await accessToken();
      const response = await fetch('/api/drive-connections', { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Xidhiidhyada Drive lama soo qaadi karin.');
      const list: ConnectionSummary[] = (result.connections || []).map((c: ConnectionSummary) => ({ id: c.id, name: c.name }));
      setConnections(list);
      // Skip the picker screen entirely when there's only one connection — same
      // one-account experience as before this feature existed.
      if (list.length === 1) setConnectionId(list[0].id);
      // Storage size is computed on demand (tap "Hubi booska") rather than automatically
      // here — it's a full folder-tree walk, the same cost the background sync job pays
      // deliberately off the request path. Doing that for every room on every page load
      // was making Drive Files itself feel slower, for a number nobody had asked to see yet.
    } catch (loadError) {
      setConnectionsError(loadError instanceof Error ? loadError.message : 'Xidhiidhyada Drive lama soo qaadi karin.');
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadConnections(), 0);
    return () => clearTimeout(timer);
  }, [loadConnections]);

  const loadQuota = async (connId: number) => {
    setQuotas((prev) => ({ ...prev, [connId]: 'loading' }));
    try {
      const token = await accessToken();
      const response = await fetch(`/api/drive-connections/${connId}/quota`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error();
      const quota: Quota = await response.json();
      setQuotas((prev) => ({ ...prev, [connId]: quota }));
    } catch {
      setQuotas((prev) => ({ ...prev, [connId]: 'error' }));
    }
  };

  const load = useCallback(async (opts: { folderId?: string | null; query?: string }) => {
    if (connectionId == null) return;
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      const params = new URLSearchParams({ connectionId: String(connectionId) });
      if (opts.query) params.set('q', opts.query);
      else if (opts.folderId) params.set('folderId', opts.folderId);

      const response = await fetch(`/api/drive-files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Diiwaanka Drive lama soo qaadi karin.');

      if (result.mode === 'search') {
        const data = result as SearchResponse;
        setItems(data.items);
        setPath([]);
      } else {
        const data = result as BrowseResponse;
        setItems(data.items);
        setPath(data.path);
        setFolderId(data.folderId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Diiwaanka Drive lama soo qaadi karin.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // Browse the connection's shared root folder as soon as one is selected.
  useEffect(() => {
    if (connectionId == null) return;
    const timer = setTimeout(() => {
      setSearchInput('');
      setActiveQuery('');
      setFolderId(null);
      setPath([]);
      setItems([]);
      void load({});
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  // Debounce search input.
  useEffect(() => {
    if (connectionId == null) return;
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      if (trimmed) {
        setActiveQuery(trimmed);
        void load({ query: trimmed });
      } else if (activeQuery) {
        setActiveQuery('');
        void load({ folderId });
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const openFolder = (id: string) => {
    setSearchInput('');
    setActiveQuery('');
    void load({ folderId: id });
  };

  const clearSearch = () => {
    setSearchInput('');
    setActiveQuery('');
    void load({ folderId });
  };

  const changeConnection = () => {
    setConnectionId(null);
    setItems([]);
    setPath([]);
    setFolderId(null);
    setSearchInput('');
    setActiveQuery('');
    setError(null);
  };

  const handleDownload = async (item: DriveItem) => {
    if (connectionId == null) return;
    setDownloadingId(item.id);
    setDownloadError(null);
    try {
      const token = await accessToken();
      const params = new URLSearchParams({ connectionId: String(connectionId), fileId: item.id });
      const response = await fetch(`/api/drive-files/download?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Download-ku wuu fashilmay.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadErr) {
      setDownloadError(downloadErr instanceof Error ? downloadErr.message : 'Download-ku wuu fashilmay.');
    } finally {
      setDownloadingId(null);
    }
  };

  const openPreview = async (item: DriveItem) => {
    if (connectionId == null) return;
    setPreviewItem(item);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewRotation(0);
    setPreviewLoading(true);
    try {
      const token = await accessToken();
      const params = new URLSearchParams({ connectionId: String(connectionId), fileId: item.id });
      const response = await fetch(`/api/drive-files/download?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'File-ka lama soo bandhigi karin.');
      }
      const blob = await response.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (previewErr) {
      setPreviewError(previewErr instanceof Error ? previewErr.message : 'File-ka lama soo bandhigi karin.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewItem(null);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewRotation(0);
  };

  const isSearching = activeQuery.length > 0;
  const notConfigured = error?.includes('lama dejin') || connectionsError?.includes('lama dejin');
  const sortedItems = useMemo(() => sortItems(items, sortKey), [items, sortKey]);
  const selectedConnectionName = connections.find((c) => c.id === connectionId)?.name;

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Diiwaanka Drive</h1>
        <p className="text-sm text-slate-500">
          Raadi ama soo baar dhammaan Word files-ka iyo subfolder-rada Google Drive ee la wadaagay.
        </p>
      </div>

      {connectionsLoading ? (
        <ListLoadingSkeleton rows={3} />
      ) : connectionsError ? (
        <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl flex flex-col items-center gap-3 py-16 px-6 text-center shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-bold text-slate-700 max-w-md">{connectionsError}</p>
          {notConfigured && (
            <p className="text-xs text-slate-400 max-w-md">
              Admin-ka: aad Settings &gt; Drive Connections oo ku dar xidhiidh Google Drive ah.
            </p>
          )}
          <button
            type="button"
            onClick={() => loadConnections()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Isku day mar kale
          </button>
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl flex flex-col items-center gap-2 py-16 text-center px-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <Cloud className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">Wali lama diyaarin xidhiidh Google Drive ah.</p>
          <p className="text-xs text-slate-400 max-w-sm">Admin-ka: aad Settings &gt; Drive Connections oo ku dar mid.</p>
        </div>
      ) : connectionId == null ? (
        <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-4 md:p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Dooro xidhiidhka Drive</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {connections.map((conn) => {
              const quota = quotas[conn.id];
              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 hover:border-teal-200 hover:bg-teal-50/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setConnectionId(conn.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <Cloud className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">{conn.name}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
                        {!quota || quota === 'error' ? (
                          'Booska lama hubin'
                        ) : quota === 'loading' ? (
                          'Xisaabinaya...'
                        ) : (
                          <>Isticmaalka guud: <span className="text-slate-600">{formatBytes(quota.usageBytes)}</span></>
                        )}
                      </span>
                    </span>
                  </button>
                  {(!quota || quota === 'error') && (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); void loadQuota(conn.id); }}
                      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-white hover:text-teal-700 transition-colors cursor-pointer"
                    >
                      Hubi booska
                    </button>
                  )}
                  {quota === 'loading' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={changeConnection}
            className="flex max-w-full items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-teal-700 cursor-pointer"
          >
            <Cloud className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{selectedConnectionName}</span>
            <span className="shrink-0 text-slate-300">&middot;</span>
            <span className="shrink-0 underline">Bedel xidhiidhka</span>
          </button>

          <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-3 md:p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Raadi magac ama nambar (tusaale: R-1042, 'Xamdi Cali')..."
                className="w-full bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl py-2.5 md:py-3.5 pl-10 md:pl-11 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Tirtir raadinta"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                {!isSearching && path.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
                    {path.map((crumb, index) => (
                      <span key={crumb.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openFolder(crumb.id)}
                          className={`hover:text-teal-700 cursor-pointer ${index === path.length - 1 ? 'text-slate-900' : ''}`}
                        >
                          {crumb.name}
                        </button>
                        {index < path.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                      </span>
                    ))}
                  </div>
                )}

                {isSearching && (
                  <p className="text-xs font-semibold text-slate-500">
                    Natiijooyinka raadinta ee &ldquo;{activeQuery}&rdquo; ({items.length})
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as SortKey)}
                    className="appearance-none bg-slate-50/60 border border-slate-200/80 rounded-lg pl-7 pr-7 py-1.5 text-[11px] font-bold text-slate-600 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 cursor-pointer"
                    aria-label="Sort by"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {sortKey === 'name-asc' && <ArrowDownAZ className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />}
                  {sortKey === 'name-desc' && <ArrowUpAZ className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />}
                  {(sortKey === 'date-desc' || sortKey === 'date-oldest') && <Clock className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />}
                  <ChevronRight className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 rotate-90 text-slate-400" />
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    aria-pressed={viewMode === 'list'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      viewMode === 'list' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    aria-pressed={viewMode === 'grid'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      viewMode === 'grid' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {downloadError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {downloadError}
            </div>
          )}

          <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            {loading ? (
              <ListLoadingSkeleton rows={5} />
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
                <p className="text-sm font-bold text-slate-700 max-w-md">{error}</p>
                <button
                  type="button"
                  onClick={() => load(isSearching ? { query: activeQuery } : { folderId })}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Isku day mar kale
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
                <FolderClosed className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">
                  {isSearching ? 'Wax natiijo ah lama helin.' : 'Folder-kani waa madhan.'}
                </p>
              </div>
            ) : viewMode === 'list' ? (
              <ul className="divide-y divide-slate-200/80">
                {sortedItems.map((item) => (
                  <li key={item.id}>
                    {item.kind === 'folder' ? (
                      <button
                        type="button"
                        onClick={() => openFolder(item.id)}
                        className="flex w-full items-center gap-3 px-4 md:px-6 py-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                          <FolderClosed className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{item.name}</span>
                        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                      </button>
                    ) : (
                      <div className="flex w-full items-center gap-3 px-4 md:px-6 py-3.5 hover:bg-slate-50 transition-colors">
                        {previewKind(item.mimeType) ? (
                          <button
                            type="button"
                            onClick={() => openPreview(item)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                              <FileTypeIcon mimeType={item.mimeType} className="h-4.5 w-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-slate-800">{item.name}</span>
                              {item.modifiedTime && (
                                <span className="block text-[11px] font-semibold text-slate-400">
                                  La bedelay {formatDate(item.modifiedTime)}
                                </span>
                              )}
                            </span>
                          </button>
                        ) : (
                          <Link
                            href={item.webViewLink || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-w-0 flex-1 items-center gap-3"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                              <FileTypeIcon mimeType={item.mimeType} className="h-4.5 w-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-slate-800">{item.name}</span>
                              {item.modifiedTime && (
                                <span className="block text-[11px] font-semibold text-slate-400">
                                  La bedelay {formatDate(item.modifiedTime)}
                                </span>
                              )}
                            </span>
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          disabled={downloadingId === item.id}
                          aria-label={`Soo deji ${item.name}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {downloadingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 md:p-6">
                {sortedItems.map((item) => (
                  <div
                    key={item.id}
                    className="group relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200/80 p-4 text-center hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                  >
                    {item.kind === 'folder' ? (
                      <button type="button" onClick={() => openFolder(item.id)} className="flex flex-col items-center gap-2 cursor-pointer w-full">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                          <FolderClosed className="h-6 w-6" />
                        </span>
                        <span className="w-full truncate text-xs font-bold text-slate-800">{item.name}</span>
                      </button>
                    ) : (
                      <>
                        {previewKind(item.mimeType) ? (
                          <button type="button" onClick={() => openPreview(item)} className="flex flex-col items-center gap-2 w-full cursor-pointer">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                              <FileTypeIcon mimeType={item.mimeType} className="h-6 w-6" />
                            </span>
                            <span className="w-full truncate text-xs font-bold text-slate-800">{item.name}</span>
                            {item.modifiedTime && (
                              <span className="text-[10px] font-semibold text-slate-400">{formatDate(item.modifiedTime)}</span>
                            )}
                          </button>
                        ) : (
                          <Link href={item.webViewLink || '#'} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 w-full">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                              <FileTypeIcon mimeType={item.mimeType} className="h-6 w-6" />
                            </span>
                            <span className="w-full truncate text-xs font-bold text-slate-800">{item.name}</span>
                            {item.modifiedTime && (
                              <span className="text-[10px] font-semibold text-slate-400">{formatDate(item.modifiedTime)}</span>
                            )}
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          disabled={downloadingId === item.id}
                          aria-label={`Soo deji ${item.name}`}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 opacity-0 group-hover:opacity-100 hover:border-teal-200 hover:text-teal-700 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {downloadingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {previewItem && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm md:p-6"
          onMouseDown={(event) => event.target === event.currentTarget && closePreview()}
        >
          <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl md:h-[85vh]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <FileTypeIcon mimeType={previewItem.mimeType} className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate text-sm font-bold text-slate-800">{previewItem.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {previewUrl && previewKind(previewItem.mimeType) === 'image' && (
                  <button
                    type="button"
                    onClick={() => setPreviewRotation((prev) => (prev + 90) % 360)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    aria-label="Wareeji sawirka"
                    title="Wareeji sawirka"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDownload(previewItem)}
                  disabled={downloadingId === previewItem.id}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {downloadingId === previewItem.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Soo deji</span>
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                  aria-label="Xir"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100 p-3 md:p-6">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs font-semibold">Loading...</span>
                </div>
              ) : previewError ? (
                <div className="flex flex-col items-center gap-3 text-center text-rose-600">
                  <AlertTriangle className="h-8 w-8" />
                  <span className="max-w-sm text-xs font-bold">{previewError}</span>
                </div>
              ) : previewUrl && previewKind(previewItem.mimeType) === 'pdf' ? (
                <iframe src={previewUrl} title={previewItem.name} className="h-full w-full rounded-xl border border-slate-200 bg-white" />
              ) : previewUrl && previewKind(previewItem.mimeType) === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={previewItem.name}
                  style={{ imageOrientation: 'from-image', transform: `rotate(${previewRotation}deg)` }}
                  className="max-h-[70vh] max-w-[90%] rounded-xl object-contain transition-transform duration-200"
                />
              ) : previewUrl && previewKind(previewItem.mimeType) === 'video' ? (
                <video src={previewUrl} controls autoPlay className="max-h-full max-w-full rounded-xl bg-black" />
              ) : previewUrl && previewKind(previewItem.mimeType) === 'audio' ? (
                <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                    <FileAudio className="h-8 w-8" />
                  </span>
                  <audio src={previewUrl} controls autoPlay className="w-full" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronRight,
  Clock,
  Download,
  File,
  FolderClosed,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
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
  const [folderId, setFolderId] = useState<string | null>(null);
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async (opts: { folderId?: string | null; query?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      const params = new URLSearchParams();
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
  }, []);

  // Initial load: browse the shared root folder.
  useEffect(() => {
    const timer = setTimeout(() => void load({}), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Debounce search input.
  useEffect(() => {
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

  const handleDownload = async (item: DriveItem) => {
    setDownloadingId(item.id);
    setDownloadError(null);
    try {
      const token = await accessToken();
      const response = await fetch(`/api/drive-files/download?fileId=${encodeURIComponent(item.id)}`, {
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

  const isSearching = activeQuery.length > 0;
  const notConfigured = error?.includes('lama dejin');
  const sortedItems = useMemo(() => sortItems(items, sortKey), [items, sortKey]);

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Diiwaanka Drive</h1>
        <p className="text-sm text-slate-500">
          Raadi ama soo baar dhammaan Word files-ka iyo subfolder-rada Google Drive ee la wadaagay.
        </p>
      </div>

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
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm font-semibold">Soo raraya...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-bold text-slate-700 max-w-md">{error}</p>
            {notConfigured && (
              <p className="text-xs text-slate-400 max-w-md">
                Admin-ka: buuxi GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY iyo GOOGLE_DRIVE_ROOT_FOLDER_ID ee .env.local (eeg README.md).
              </p>
            )}
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
          <ul className="divide-y divide-slate-100">
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
                    <Link
                      href={item.webViewLink || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                        <File className="h-4.5 w-4.5" />
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
                    <Link href={item.webViewLink || '#'} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 w-full">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                        <File className="h-6 w-6" />
                      </span>
                      <span className="w-full truncate text-xs font-bold text-slate-800">{item.name}</span>
                      {item.modifiedTime && (
                        <span className="text-[10px] font-semibold text-slate-400">{formatDate(item.modifiedTime)}</span>
                      )}
                    </Link>
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
    </div>
  );
}

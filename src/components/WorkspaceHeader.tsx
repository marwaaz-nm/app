'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, FileText, Layers3, Loader2, Search, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type SearchItem = { id: string; type: 'survey' | 'reference' | 'transfer'; title: string; subtitle: string; href: string };
type AlertItem = { id: string; level: 'review' | 'warning' | 'info'; title: string; detail: string; href: string; date?: string };

async function authenticatedWorkspaceFetch(path: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');
  return fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
}

export default function WorkspaceHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, user, loading } = useAuth();
  const userId = user?.id;
  const profileId = profile?.id;
  const schemaReady = Array.isArray(profile?.permitted_actions);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (loading || !userId || !profileId || !schemaReady) return;
    let active = true;
    void (async () => {
      try {
        const response = await authenticatedWorkspaceFetch('/api/workspace');
        const data = await response.json();
        if (active && response.ok) setAlerts(data.alerts || []);
      } catch { /* Auth context handles expired sessions. */ }
    })();
    return () => { active = false; };
  }, [loading, pathname, profileId, schemaReady, userId]);

  useEffect(() => {
    const cleanQuery = query.trim();
    const sequence = ++requestSequence.current;
    if (cleanQuery.length < 2 || loading || !userId || !profileId || !schemaReady) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const response = await authenticatedWorkspaceFetch(`/api/workspace?q=${encodeURIComponent(cleanQuery)}`);
          const data = await response.json();
          if (sequence === requestSequence.current) setResults(response.ok ? data.items || [] : []);
        } finally {
          if (sequence === requestSequence.current) setSearching(false);
        }
      })();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [loading, profileId, query, schemaReady, userId]);

  const visibleAlerts: AlertItem[] = schemaReady ? alerts : [];

  const navigate = (href: string) => {
    setShowSearch(false); setShowAlerts(false); setQuery(''); router.push(href);
  };
  const updateQuery = (value: string) => {
    setQuery(value);
    setShowSearch(true);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
    }
  };
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xl md:px-6">
      <div className="relative mx-auto hidden max-w-xl flex-1 md:block">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input disabled={!schemaReady} value={query} onFocus={() => setShowSearch(true)} onChange={(event) => updateQuery(event.target.value)} placeholder="Raadi survey, milkiile, reference ama wareejin..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:text-slate-400" />
        {query && <button onClick={() => { setQuery(''); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
        {showSearch && query.trim().length >= 2 && <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Natiijada raadinta</div>
          {searching ? <div className="flex items-center justify-center gap-2 p-6 text-xs font-bold text-blue-600"><Loader2 className="h-4 w-4 animate-spin" /> Raadin...</div> : results.length === 0 ? <p className="p-6 text-center text-xs font-semibold text-slate-400">Wax natiijo ah lama helin.</p> : <div className="max-h-80 overflow-y-auto p-2">{results.map((item) => <button key={item.id} onClick={() => navigate(item.href)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.type === 'survey' ? 'bg-blue-50 text-blue-600' : item.type === 'reference' ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'}`}>{item.type === 'survey' ? <Layers3 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span><span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{item.title}</span><span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{item.subtitle}</span></span></button>)}</div>}
        </div>}
      </div>

      <div className="flex-1 md:hidden" />
      <button onClick={() => { setShowSearch(!showSearch); setShowAlerts(false); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 md:hidden" aria-label="Raadi"><Search className="h-4 w-4" /></button>
      <div className="relative">
        <button onClick={() => { setShowAlerts(!showAlerts); setShowSearch(false); }} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Ogeysiis"><Bell className="h-4 w-4" />{visibleAlerts.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[8px] font-black text-white">{Math.min(visibleAlerts.length, 9)}{visibleAlerts.length > 9 ? '+' : ''}</span>}</button>
        {showAlerts && <div className="absolute right-0 top-12 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-xs font-black text-slate-900">Ogeysiisyada shaqada</p><p className="mt-0.5 text-[9px] font-semibold text-slate-400">Waxyaabaha u baahan ficil</p></div><span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">{visibleAlerts.length}</span></div>
          <div className="max-h-96 overflow-y-auto p-2">{visibleAlerts.length === 0 ? <div className="p-8 text-center"><Bell className="mx-auto h-7 w-7 text-slate-200" /><p className="mt-2 text-xs font-bold text-slate-500">Wax ogeysiis ah ma jiro.</p></div> : visibleAlerts.map((alert) => <button key={alert.id} onClick={() => navigate(alert.href)} className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${alert.level === 'review' ? 'bg-amber-50 text-amber-600' : alert.level === 'warning' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}><ShieldAlert className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-[11px] font-black text-slate-800">{alert.title}</span><span className="mt-1 block truncate text-[9px] font-semibold text-slate-500">{alert.detail}</span></span></button>)}</div>
        </div>}
      </div>
      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 md:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-teal-600 text-[10px] font-black text-white">{profile?.fullname?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GS'}</div></div>

      {showSearch && <button className="fixed inset-0 -z-10 cursor-default" onClick={() => setShowSearch(false)} aria-label="Xir raadinta" />}
      {showAlerts && <button className="fixed inset-0 -z-10 cursor-default" onClick={() => setShowAlerts(false)} aria-label="Xir ogeysiisyada" />}
      {showSearch && <div className="absolute left-3 right-3 top-16 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl md:hidden"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Raadi..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs outline-none" /></div>{query.trim().length >= 2 && <div className="mt-2 max-h-72 overflow-y-auto">{searching ? <p className="p-4 text-center text-xs text-blue-600">Raadin...</p> : results.map((item) => <button key={item.id} onClick={() => navigate(item.href)} className="block w-full rounded-xl p-3 text-left hover:bg-slate-50"><span className="block text-xs font-black text-slate-800">{item.title}</span><span className="text-[9px] text-slate-500">{item.subtitle}</span></button>)}</div>}</div>}
    </header>
  );
}

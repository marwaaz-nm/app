'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

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
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);

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

  const visibleAlerts: AlertItem[] = schemaReady ? alerts : [];

  const navigate = (href: string) => {
    setShowAlerts(false);
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xl md:px-6">
      <div className="relative">
        <button onClick={() => setShowAlerts(!showAlerts)} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Ogeysiis"><Bell className="h-4 w-4" />{visibleAlerts.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[8px] font-black text-white">{Math.min(visibleAlerts.length, 9)}{visibleAlerts.length > 9 ? '+' : ''}</span>}</button>
        {showAlerts && <div className="absolute right-0 top-12 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-xs font-black text-slate-900">Ogeysiisyada shaqada</p><p className="mt-0.5 text-[9px] font-semibold text-slate-400">Waxyaabaha u baahan ficil</p></div><span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">{visibleAlerts.length}</span></div>
          <div className="max-h-96 overflow-y-auto p-2">{visibleAlerts.length === 0 ? <div className="p-8 text-center"><Bell className="mx-auto h-7 w-7 text-slate-200" /><p className="mt-2 text-xs font-bold text-slate-500">Wax ogeysiis ah ma jiro.</p></div> : visibleAlerts.map((alert) => <button key={alert.id} onClick={() => navigate(alert.href)} className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${alert.level === 'review' ? 'bg-amber-50 text-amber-600' : alert.level === 'warning' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}><ShieldAlert className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-[11px] font-black text-slate-800">{alert.title}</span><span className="mt-1 block truncate text-[9px] font-semibold text-slate-500">{alert.detail}</span></span></button>)}</div>
        </div>}
      </div>
      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 md:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-teal-600 text-[10px] font-black text-white">{profile?.fullname?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GS'}</div></div>

      {showAlerts && <button className="fixed inset-0 -z-10 cursor-default" onClick={() => setShowAlerts(false)} aria-label="Xir ogeysiisyada" />}
    </header>
  );
}

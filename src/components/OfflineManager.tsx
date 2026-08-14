'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type WorkerMessage = { type?: string; pending?: number };

export default function OfflineManager() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let active = true;
    const updateStatus = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (nextOnline) {
        setSyncing(true);
        void supabase.auth.getSession().then(({ data }) => {
          navigator.serviceWorker.controller?.postMessage({
            type: 'SYNC_OFFLINE_QUEUE',
            accessToken: data.session?.access_token || null,
          });
        });
      }
    };
    const handleMessage = (event: MessageEvent<WorkerMessage>) => {
      if (!active) return;
      if (event.data.type === 'OFFLINE_QUEUE_STATUS') {
        setPending(event.data.pending || 0);
        setSyncing(false);
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    navigator.serviceWorker.addEventListener('message', handleMessage);
    const wasUncontrolled = !navigator.serviceWorker.controller;
    const handleControllerChange = () => {
      if (!wasUncontrolled || sessionStorage.getItem('marwaazpn-sw-reloaded')) return;
      sessionStorage.setItem('marwaazpn-sw-reloaded', '1');
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    void navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then(async () => {
      await navigator.serviceWorker.ready;
      navigator.serviceWorker.controller?.postMessage({ type: 'GET_OFFLINE_QUEUE_STATUS' });
      if (navigator.onLine) {
        const { data } = await supabase.auth.getSession();
        navigator.serviceWorker.controller?.postMessage({
          type: 'SYNC_OFFLINE_QUEUE',
          accessToken: data.session?.access_token || null,
        });
      }
    }).catch((error) => console.error('[Offline] Service worker registration failed:', error));

    return () => {
      active = false;
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  if (online && pending === 0 && !syncing) return null;

  return (
    <div className={`fixed bottom-[5.5rem] right-3 z-[2000] flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-black text-white shadow-xl md:bottom-4 md:right-4 ${online ? 'bg-amber-500' : 'bg-slate-800'}`} role="status">
      {online ? <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> : <CloudOff className="h-3.5 w-3.5" />}
      <span>
        {!online ? `Offline${pending ? ` · ${pending} sugaya sync` : ''}` : syncing ? 'Xogta waa la sync-gareynayaa…' : `${pending} sugaya sync`}
      </span>
    </div>
  );
}

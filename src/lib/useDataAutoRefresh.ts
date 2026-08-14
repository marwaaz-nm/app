'use client';

import { useEffect, useRef } from 'react';

export const DATA_CHANGED_EVENT = 'marwaazpn-data-changed';

export function notifyDataChanged() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATA_CHANGED_EVENT, String(Date.now()));
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

export function useDataAutoRefresh(refresh: () => void | Promise<void>, intervalMs = 15000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const run = () => { void refreshRef.current(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DATA_CHANGED_EVENT) run();
    };

    window.addEventListener('focus', run);
    window.addEventListener('pageshow', run);
    window.addEventListener('online', run);
    window.addEventListener(DATA_CHANGED_EVENT, run);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, intervalMs);

    // A mutation can occur on another route before this list page mounts. Events sent
    // during that gap cannot be replayed, so always reconcile once on subscription.
    run();

    return () => {
      window.removeEventListener('focus', run);
      window.removeEventListener('pageshow', run);
      window.removeEventListener('online', run);
      window.removeEventListener(DATA_CHANGED_EVENT, run);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}

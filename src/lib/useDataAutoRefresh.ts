'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export const DATA_CHANGED_EVENT = 'marwaazpn-data-changed';
export const PENDING_SURVEY_KEY = 'marwaazpn-pending-survey';
const REALTIME_CHANNEL_NAME = 'app-data-sync';

let globalBroadcastChannel: ReturnType<typeof supabase.channel> | null = null;

function getBroadcastChannel() {
  if (!globalBroadcastChannel) {
    globalBroadcastChannel = supabase.channel(REALTIME_CHANNEL_NAME, {
      config: { broadcast: { self: false } },
    });
    globalBroadcastChannel.subscribe();
  }
  return globalBroadcastChannel;
}

export function notifyDataChanged() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DATA_CHANGED_EVENT, String(Date.now()));
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));

  try {
    const channel = getBroadcastChannel();
    void channel.send({
      type: 'broadcast',
      event: 'data_changed',
      payload: { timestamp: Date.now() },
    });
  } catch (error) {
    console.debug('Realtime broadcast skipped:', error);
  }
}

const THROTTLE_WINDOW_MS = 30000; // 30 seconds for passive focus/tab switch events

export function useDataAutoRefresh(refresh: () => void | Promise<void>, intervalMs = 300000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastRunRef = useRef(0);

  useEffect(() => {
    const run = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRunRef.current < THROTTLE_WINDOW_MS) {
        return;
      }
      lastRunRef.current = now;
      void refreshRef.current();
    };

    const onFocus = () => run();
    const onPageShow = () => run();
    const onOnline = () => run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DATA_CHANGED_EVENT) run(true);
    };
    const onDataChanged = () => run(true);

    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);

    // Subscribe to Supabase Realtime cross-user broadcast
    const channel = supabase
      .channel(`${REALTIME_CHANNEL_NAME}-${Math.random().toString(36).slice(2, 7)}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'data_changed' }, () => {
        run(true);
      })
      .subscribe();

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, intervalMs);

    // Initial mount run
    run(true);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [intervalMs]);
}

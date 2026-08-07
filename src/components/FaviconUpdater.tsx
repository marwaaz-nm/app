'use client';

import { useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';

// Next.js emits a static <link rel="icon" href="/favicon.ico"> at build time
// from app/favicon.ico, but the notary's logo is an admin-uploaded, DB-driven
// value — there's no build-time file to point that convention at. Swap the
// tag's href client-side once the logo is known instead.
export default function FaviconUpdater() {
  const { settings } = useSettings();

  useEffect(() => {
    if (!settings.logo_url) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = settings.logo_url;
  }, [settings.logo_url]);

  return null;
}

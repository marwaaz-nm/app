'use client';

import { useEffect } from 'react';

// Keep the browser icon on the transparent app-ready asset. The settings logo is
// intended for full-size headers and documents, and may include a white canvas.
export default function FaviconUpdater() {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = '/icon.png?v=20260814-transparent';
  }, []);

  return null;
}

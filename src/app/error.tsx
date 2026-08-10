'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[UI error]', error); }, [error]);
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><AlertTriangle className="h-7 w-7" /></span><h1 className="mt-5 text-xl font-black text-slate-900">Waxbaa khaldamay</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">Boggu si sax ah uma furmin. Isku day inaad dib u soo celiso.</p><button onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black text-white"><RefreshCw className="h-4 w-4" /> Isku day mar kale</button></div></div>;
}

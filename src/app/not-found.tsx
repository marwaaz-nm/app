import Link from 'next/link';
import { ArrowLeft, MapPinned } from 'lucide-react';

export default function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MapPinned className="h-7 w-7" /></span><p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-blue-600">404</p><h1 className="mt-2 text-xl font-black text-slate-900">Boggan lama helin</h1><p className="mt-2 text-sm font-medium text-slate-500">Cinwaanka aad furtay ma jiro ama waa la beddelay.</p><Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black text-white"><ArrowLeft className="h-4 w-4" /> Ku noqo dashboard</Link></div></div>;
}

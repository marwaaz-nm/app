'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  console.log('[RootPage] Rendered: loading =', loading, 'user =', user ? `User ID: ${user.id}` : 'null');

  useEffect(() => {
    console.log('[RootPage] useEffect triggered: loading =', loading, 'user =', user ? `User ID: ${user.id}` : 'null');
    if (!loading) {
      if (user) {
        console.log('[RootPage] Redirecting to /explorer...');
        router.push('/explorer');
      } else {
        console.log('[RootPage] Redirecting to /login...');
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-500">Redirecting...</p>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import { usePathname, useRouter } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Route protection based on permitted_menus
  useEffect(() => {
    if (!loading && user && profile && profile.role !== 'Admin') {
      const standardRoutes = ['/references', '/explorer', '/records', '/transfers', '/financials'];
      const currentBaseRoute = standardRoutes.find(route => pathname.startsWith(route));
      
      if (currentBaseRoute && profile.permitted_menus && Array.isArray(profile.permitted_menus)) {
        if (!profile.permitted_menus.includes(currentBaseRoute)) {
          // Redirect to the first permitted menu, or explorer if none
          const firstPermitted = profile.permitted_menus[0] || '/explorer';
          router.push(firstPermitted);
        }
      }
    }
  }, [loading, user, profile, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-600 border-t-transparent shadow-lg shadow-teal-500/10" />
          <p className="text-sm font-semibold text-slate-600 animate-pulse">
            GeoSurvey Pro | Loading...
          </p>
        </div>
      </div>
    );
  }

  // If not logged in, AuthContext will handle redirection to /login
  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* Navigation Shell */}
      <Sidebar />

      {/* Main Content panel */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-y-auto pb-16 md:pb-0 bg-slate-50">
        <div className="w-full min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}

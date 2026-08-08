'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import WorkspaceHeader from '@/components/WorkspaceHeader';
import { MobileSearchProvider } from '@/context/MobileSearchContext';
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
    if (!loading && user && profile && profile.role !== 'Admin' && profile.role !== 'SuperAdmin') {
      const standardRoutes = ['/references', '/explorer', '/records', '/transfers', '/financials', '/reports'];
      const currentBaseRoute = standardRoutes.find(route => pathname.startsWith(route));
      
      if (currentBaseRoute) {
        const permittedMenus = Array.isArray(profile.permitted_menus) ? profile.permitted_menus : [];
        const missingMenu = !permittedMenus.includes(currentBaseRoute);
        const missingReportAction = currentBaseRoute === '/reports' && !profile.permitted_actions?.includes('report.view');
        if (missingMenu || missingReportAction) {
          router.push('/dashboard');
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
    <div className="flex h-dvh w-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* Navigation Shell */}
      <Sidebar />

      {/* Content column: header stays fixed in place, only the middle area scrolls */}
      <MobileSearchProvider>
        <div className="flex-1 flex flex-col min-w-0 h-full relative bg-slate-50">
          <WorkspaceHeader />
          <main className="flex-1 min-h-0 overflow-y-auto pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-0 bg-slate-50">
            <div className="w-full min-h-full">
              {children}
            </div>
          </main>
        </div>
      </MobileSearchProvider>
    </div>
  );
}

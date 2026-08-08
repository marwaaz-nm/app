'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  BarChart3,
  ChartNoAxesCombined,
  ChevronRight,
  Compass,
  Files,
  Layers,
  Lock,
  LogOut,
  MapPinned,
  Settings,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

const primaryNavigation = [
  { href: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: ChartNoAxesCombined, alwaysVisible: true },
  { href: '/references', label: 'References', mobileLabel: 'Tixraac', icon: Files },
  { href: '/explorer', label: 'Map Explorer', mobileLabel: 'Maab', icon: Compass },
  { href: '/records', label: 'Survey Records', mobileLabel: 'Sahan', icon: Layers },
  { href: '/transfers', label: 'Wareejin Dhul', mobileLabel: 'Wareejin', icon: ArrowLeftRight },
  { href: '/financials', label: 'Financials', mobileLabel: 'Xisaab', icon: Wallet },
  { href: '/reports', label: 'Reports & Export', mobileLabel: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings, alwaysVisible: true },
];

const adminNavigation = {
  href: '/users',
  label: 'User Control',
  mobileLabel: 'Staff',
  icon: Lock,
};

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const { settings } = useSettings();
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'SuperAdmin';

  const permittedNavigation = isAdmin
    ? [...primaryNavigation, adminNavigation]
    : primaryNavigation.filter(
        (item) =>
          item.alwaysVisible ||
          ((Array.isArray(profile?.permitted_menus)
            ? profile.permitted_menus.includes(item.href)
            : false) && (item.href !== '/reports' || profile?.permitted_actions?.includes('report.view'))),
      );

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const initials = (profile?.fullname || 'GeoSurvey User')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <aside className="relative hidden h-screen w-[252px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-900 shadow-[4px_0_24px_rgba(15,23,42,0.03)] md:flex">
        <div className="pointer-events-none absolute -left-24 -top-28 h-64 w-64 rounded-full bg-teal-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-28 h-72 w-72 rounded-full bg-amber-50 blur-3xl" />

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
            <div
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] shadow-[0_8px_22px_rgba(37,99,235,0.22)] ${
                settings.logo_url ? 'border border-slate-200 bg-white p-1' : 'bg-teal-600 text-white'
              }`}
            >
              {settings.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo_url} alt={settings.org_name_en} className="h-full w-full object-contain" />
              ) : (
                <>
                  <MapPinned className="h-5 w-5" strokeWidth={2.2} />
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-[3px] border-white bg-amber-400" />
                </>
              )}
            </div>
            <div className="min-w-0">
              <span className="block truncate text-[15px] font-extrabold leading-tight tracking-[-0.02em] text-slate-900">
                {settings.org_name_so}
              </span>
              <p className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {settings.org_name_en}
              </p>
            </div>
          </div>

          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
            <p className="mb-2.5 px-3 text-[9px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
              Workspace
            </p>
            <div className="space-y-1">
              {permittedNavigation.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-200 ${
                      active
                        ? 'bg-teal-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.2)]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-colors ${
                        active
                          ? 'bg-white/15 text-white'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-700'
                      }`}
                    >
                      <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-[-0.01em]">
                      {item.label}
                    </span>
                    <ChevronRight
                      className={`h-4 w-4 transition-all ${
                        active
                          ? 'translate-x-0 text-white/70 opacity-100'
                          : '-translate-x-1 text-slate-300 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                      }`}
                    />
                  </Link>
                );
              })}
            </div>
          </nav>

        </div>

        <div className="relative border-t border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-700 text-[12px] font-black text-white shadow-lg shadow-black/20">
              {initials}
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[3px] border-white bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-slate-800">
                {profile?.fullname || 'Loading...'}
              </p>
              <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {profile?.role || 'User'} account
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              <LogOut className="h-[17px] w-[17px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </aside>

      <nav
        className="fixed bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] left-3 right-3 z-50 grid h-[68px] overflow-x-auto rounded-[22px] border border-slate-200 bg-white/95 px-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.15)] backdrop-blur-xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${permittedNavigation.length}, minmax(68px, 1fr))` }}
        aria-label="Mobile navigation"
      >
        {permittedNavigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
                active ? 'text-teal-700' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {active && <span className="absolute top-0 h-[3px] w-6 rounded-b-full bg-teal-400" />}
              <span
                className={`flex h-8 w-9 items-center justify-center rounded-xl transition-all ${
                  active ? 'bg-teal-500 text-white shadow-[0_6px_16px_rgba(59,130,246,0.35)]' : ''
                }`}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span className="w-full truncate px-0.5 text-center text-[8px] font-extrabold uppercase tracking-[0.08em]">
                {item.mobileLabel}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

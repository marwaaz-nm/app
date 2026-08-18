'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive,
  ArrowLeftRight,
  BarChart3,
  ChartNoAxesCombined,
  ChevronRight,
  Compass,
  Files,
  FolderSearch,
  Layers,
  Lock,
  LogOut,
  MapPinned,
  MoreHorizontal,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

type NavItem = { href: string; label: string; mobileLabel: string; icon: typeof ChartNoAxesCombined; alwaysVisible?: boolean };

// Grouped by what the user is actually doing, rather than one long flat list — makes the
// 11+ menu items scannable instead of a wall of undifferentiated links.
const navigationGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: ChartNoAxesCombined, alwaysVisible: true },
      { href: '/references', label: 'References', mobileLabel: 'Refs', icon: Files },
    ],
  },
  {
    label: 'Land Surveys',
    items: [
      { href: '/explorer', label: 'Map Explorer', mobileLabel: 'Explorer', icon: Compass },
      { href: '/records', label: 'Survey Records', mobileLabel: 'Surveys', icon: Layers },
      { href: '/transfers', label: 'Land Transfers', mobileLabel: 'Transfers', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Data & Documents',
    items: [
      { href: '/drive-files', label: 'Drive Files', mobileLabel: 'Drive', icon: FolderSearch },
      { href: '/customers', label: 'Customers', mobileLabel: 'Customers', icon: Users },
      { href: '/document-archive', label: 'Document Archive', mobileLabel: 'Archive', icon: Archive },
    ],
  },
  {
    label: 'Finance & Reports',
    items: [
      { href: '/financials', label: 'Financials', mobileLabel: 'Finance', icon: Wallet },
      { href: '/reports', label: 'Reports & Export', mobileLabel: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings, alwaysVisible: true },
      { href: '/users', label: 'User Control', mobileLabel: 'Staff', icon: Lock },
    ],
  },
];

// Only the top few destinations get a permanent slot in the mobile tab bar; the rest live
// behind "More" so the bar stays readable instead of squeezing in 8-11 tiny icons.
const PRIMARY_MOBILE_HREFS = ['/dashboard', '/explorer', '/records', '/references'];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const { settings } = useSettings();
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'SuperAdmin';
  const [moreOpen, setMoreOpen] = useState(false);

  const isPermitted = (item: NavItem) =>
    item.href === '/users'
      ? isAdmin
      : isAdmin ||
        item.alwaysVisible ||
        ((Array.isArray(profile?.permitted_menus) ? profile.permitted_menus.includes(item.href) : false) &&
          (item.href !== '/reports' || profile?.permitted_actions?.includes('report.view')));

  const permittedGroups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter(isPermitted) }))
    .filter((group) => group.items.length > 0);

  const permittedNavigation = permittedGroups.flatMap((group) => group.items);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const primaryMobileNav = PRIMARY_MOBILE_HREFS
    .map((href) => permittedNavigation.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const moreMobileNav = permittedNavigation.filter((item) => !PRIMARY_MOBILE_HREFS.includes(item.href));
  const moreActive = moreMobileNav.some((item) => isActive(item.href));

  const initials = (profile?.fullname || 'Marwaazpn App User')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <aside className="relative hidden h-screen w-[252px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-900 shadow-[4px_0_24px_rgba(15,23,42,0.03)] md:flex">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
            <div
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] ${
                settings.logo_url ? 'bg-transparent' : 'bg-teal-600 text-white shadow-[0_8px_22px_rgba(37,99,235,0.22)]'
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
            <div className="space-y-5">
              {permittedGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
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
                </div>
              ))}
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
        className="fixed bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] left-3 right-3 z-50 grid h-[68px] rounded-[22px] border border-slate-200 bg-white/95 px-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.15)] backdrop-blur-xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${primaryMobileNav.length + (moreMobileNav.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
        aria-label="Mobile navigation"
      >
        {primaryMobileNav.map((item) => {
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

        {moreMobileNav.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More menu"
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
              moreActive ? 'text-teal-700' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {moreActive && <span className="absolute top-0 h-[3px] w-6 rounded-b-full bg-teal-400" />}
            <span
              className={`flex h-8 w-9 items-center justify-center rounded-xl transition-all ${
                moreActive ? 'bg-teal-500 text-white shadow-[0_6px_16px_rgba(59,130,246,0.35)]' : ''
              }`}
            >
              <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={moreActive ? 2.4 : 2} />
            </span>
            <span className="w-full truncate px-0.5 text-center text-[8px] font-extrabold uppercase tracking-[0.08em]">
              More
            </span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[1100] md:hidden">
          <button
            type="button"
            aria-label="Xir liiska"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-3 bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto rounded-[26px] border border-slate-200 bg-white p-3 shadow-[0_-18px_45px_rgba(15,23,42,0.2)]">
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <p className="text-xs font-black text-slate-800">Dhammaan Menu-yada</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Xir"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-1">
              {moreMobileNav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 transition-colors ${
                      active
                        ? 'border-teal-200 bg-teal-50 text-teal-700'
                        : 'border-slate-200 bg-slate-50/60 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        active ? 'bg-teal-500 text-white' : 'bg-white text-slate-500'
                      }`}
                    >
                      <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
                    </span>
                    <span className="text-center text-[9px] font-extrabold uppercase tracking-[0.06em]">
                      {item.mobileLabel}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  Compass, 
  Layers, 
  Files, 
  ArrowLeftRight, 
  Wallet, 
  Lock, 
  UserCircle, 
  LogOut 
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const isAdmin = profile?.role === 'Admin';

  let navItems = [
    { href: '/references', label: 'References', icon: Files },
    { href: '/explorer', label: 'Map Explorer', icon: Compass },
    { href: '/records', label: 'Survey Records', icon: Layers },
    { href: '/transfers', label: 'Wareejin Dhul', icon: ArrowLeftRight },
    { href: '/financials', label: 'Financials', icon: Wallet },
  ];

  // If user is NOT admin, filter based on permitted_menus
  if (!isAdmin) {
    if (profile?.permitted_menus && Array.isArray(profile.permitted_menus)) {
      navItems = navItems.filter(item => profile.permitted_menus?.includes(item.href));
    }
  } else {
    // Add User Control tab if admin
    navItems.push({ href: '/users', label: 'User Control', icon: Lock });
  }

  const isActive = (href: string) => {
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* DESKTOP SIDEBAR (Visible only on md screens and above) */}
      <aside className="hidden md:flex w-[272px] bg-slate-950 text-slate-300 flex-col shrink-0 h-screen justify-between border-r border-slate-900 shadow-xl">
        <div className="flex flex-col">
          {/* Brand/Logo Section */}
          <div className="px-[22px] py-[26px] flex items-center gap-3 border-b border-slate-900">
            <div className="flex h-[35px] w-[35px] items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-[0_0_15px_rgba(45,138,112,0.15)]">
              <Compass className="h-[19px] w-[19px] animate-pulse" />
            </div>
            <span className="text-[1.15rem] font-black tracking-tight text-white">
              Geo<span className="text-teal-400 font-extrabold">Survey</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-2 p-[15px] mt-5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3.5 px-4 py-[13px] rounded-xl text-[15px] font-semibold transition-all duration-200 group relative ${
                    active 
                      ? 'bg-teal-500/10 text-teal-400 font-extrabold shadow-[inset_0_0_0_1px_rgba(45,138,112,0.15)] shadow-[0_0_15px_rgba(45,138,112,0.05)]' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/60 hover:translate-x-1'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/3 bottom-1/3 w-1 rounded-r-md bg-teal-400 shadow-[0_0_8px_rgba(45,138,112,0.8)]" />
                  )}
                  <Icon className={`h-[19px] w-[19px] transition-transform duration-200 group-hover:scale-110 ${
                    active ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-350'
                  }`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Profile & Logout */}
        <div className="p-4 bg-slate-900/40 border-t border-slate-900">
          <div className="flex items-center gap-3 mb-4 px-2">
            <UserCircle className="h-[38px] w-[38px] text-teal-500 shrink-0" />
            <div className="overflow-hidden min-w-0">
              <div className="font-extrabold text-[13.5px] text-slate-200 truncate">
                {profile?.fullname || 'Loading...'}
              </div>
              <div className="text-[9.5px] uppercase tracking-wider font-black text-slate-500 mt-0.5">
                {profile?.role || 'User'}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-950/20 hover:bg-rose-600 border border-rose-900/30 hover:border-transparent px-4 py-[11px] text-[13px] font-semibold text-rose-400 hover:text-white transition-all cursor-pointer"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION (Visible only on screens smaller than md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950 border-t border-slate-900 z-50 flex items-center justify-around px-2 pb-safe shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          // Short Somali/Universal labels for mobile layout to prevent truncation
          const mobileLabel = 
            item.label === 'References' ? 'Tixraac' :
            item.label === 'Map Explorer' ? 'Maab' :
            item.label === 'Survey Records' ? 'Sahan' :
            item.label === 'Wareejin Dhul' ? 'Wareejin' :
            item.label === 'Financials' ? 'Xisaab' :
            item.label === 'User Control' ? 'Staff' : item.label;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-2 text-center transition-all ${
                active ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <div className={`flex items-center justify-center h-8 w-12 rounded-xl transition-all duration-200 ${
                active 
                  ? 'bg-teal-500/10 text-teal-400 shadow-[inset_0_0_0_1px_rgba(45,138,112,0.15)] shadow-[0_0_15px_rgba(45,138,112,0.05)]' 
                  : 'text-slate-500'
              }`}>
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <span className={`text-[10px] font-black tracking-wider uppercase mt-1 transition-all duration-200 ${
                active ? 'text-teal-400' : 'text-slate-650'
              }`}>
                {mobileLabel}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

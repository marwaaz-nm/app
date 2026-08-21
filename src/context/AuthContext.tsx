'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const offlineProfileKey = (userId: string) => `marwaazpn-profile:${userId}`;

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: async () => {},
  refetchProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const initialRouteHandledRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    let activeToken: string | null | undefined;

    const applySession = async (session: Session | null) => {
      const nextToken = session?.access_token || null;
      if (activeToken === nextToken) return;
      activeToken = nextToken;

      if (!session) {
        if (!cancelled) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (cancelled || activeToken !== nextToken) return;
      if (error) console.error('[Auth] Profile fetch failed:', error.message);
      const cachedProfile = (() => {
        try {
          const value = localStorage.getItem(offlineProfileKey(session.user.id));
          return value ? JSON.parse(value) as Profile : null;
        } catch {
          return null;
        }
      })();
      if (!error && data) localStorage.setItem(offlineProfileKey(session.user.id), JSON.stringify(data));
      setUser(session.user);
      setProfile(error ? cachedProfile : data as Profile);
      setLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Auth routing protection
  useEffect(() => {
    if (!loading) {
      const isVerifyPath = pathname.startsWith('/verify/');
      const isPublicPath = pathname === '/login' || isVerifyPath;
      const isInitialRoute = !initialRouteHandledRef.current;
      initialRouteHandledRef.current = true;

      if (!user && !isPublicPath) {
        router.replace('/login');
      } else if (user && !isVerifyPath && (pathname === '/login' || (isInitialRoute && pathname !== '/dashboard'))) {
        router.replace('/dashboard');
      }
    }
  }, [user, loading, pathname, router]);

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.push('/login');
    setLoading(false);
  };

  const refetchProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!error) {
      setProfile(data as Profile);
      localStorage.setItem(offlineProfileKey(user.id), JSON.stringify(data));
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, refetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

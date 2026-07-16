'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUser = async () => {
      console.log('[AuthContext] checkUser: Starting session check...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[AuthContext] checkUser: Session retrieved:', session ? `User ID: ${session.user.id}` : 'No session');
        if (session) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('[AuthContext] checkUser: Error checking session:', err);
      } finally {
        console.log('[AuthContext] checkUser: Setting loading to false');
        setLoading(false);
      }
    };

    checkUser();

    console.log('[AuthContext] Setting up onAuthStateChange listener...');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[AuthContext] onAuthStateChange event: ${event}`, session ? `User ID: ${session.user.id}` : 'No session');
      if (session) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      console.log('[AuthContext] Cleaning up onAuthStateChange listener...');
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(data as Profile);
      }
    } catch (err) {
      console.error('Exception fetching profile:', err);
    }
  };

  // Auth routing protection
  useEffect(() => {
    if (!loading) {
      const isPublicPath = pathname === '/login';
      if (!user && !isPublicPath) {
        router.push('/login');
      } else if (user && isPublicPath) {
        router.push('/explorer');
      }
    }
  }, [user, loading, pathname, router]);

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.push('/login');
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

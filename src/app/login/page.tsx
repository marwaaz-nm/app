'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { ShieldAlert, Shield, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { settings } = useSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Convert username to email format for Supabase Auth
    const email = username.includes('@') ? username : `${username.trim().toLowerCase()}@geosurvey.com`;

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Username ama Password waa khalad!');
        console.error('Login error:', authError);
      }
    } catch (err) {
      setError('Cillad ayaa dhacday xilliga login-ka. Fadlan isku day markale.');
      console.error('Exception during login:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-slate-800">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 shadow-xl border border-slate-100">
        <div className="text-center mb-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 border border-teal-100 shadow-sm">
            <Shield className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-850">
            GeoSurvey <span className="text-teal-600 font-bold">Pro</span>
          </h2>
          <p className="mt-2 text-xs text-slate-500 font-semibold">
            Fadlan geli aqoonsigaaga si aad u gasho
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-rose-50 p-4 text-xs text-rose-600 border border-rose-100">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-5 py-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-transparent transition-all"
              placeholder="Geli username-kaaga (e.g. admin)"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-5 py-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-transparent transition-all pr-12"
                placeholder="Geli password-kaaga"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 hover:bg-teal-600 disabled:bg-slate-100 disabled:text-slate-400 px-5 py-4 font-bold text-white shadow-lg shadow-teal-500/5 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                SIGN IN <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
      <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {settings.org_name_so} &middot; {settings.org_name_en}
      </p>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import {
  enableBiometricLogin,
  getBiometricLoginCredentials,
  hasBiometricCredentials,
  isBiometricLoginAvailable,
  removeBiometricCredentials,
  wasBiometricPromptCancelled,
} from '@/lib/mobileBiometric';
import { ShieldAlert, Shield, ArrowRight, Eye, EyeOff, Fingerprint } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

const REMEMBERED_USERNAME_KEY = 'marwaazpn-remembered-username';

function toLoginEmail(username: string) {
  const normalizedUsername = username.trim().toLowerCase();
  return normalizedUsername.includes('@') ? normalizedUsername : `${normalizedUsername}@geosurvey.com`;
}

export default function LoginPage() {
  const { settings } = useSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [rememberBiometric, setRememberBiometric] = useState(true);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    const rememberedUsername = window.localStorage.getItem(REMEMBERED_USERNAME_KEY);
    if (rememberedUsername) queueMicrotask(() => setUsername(rememberedUsername));

    void (async () => {
      try {
        const available = await isBiometricLoginAvailable();
        setBiometricAvailable(available);
        setBiometricReady(available && (await hasBiometricCredentials()));
      } catch (biometricError) {
        console.warn('Biometric availability check failed:', biometricError);
      }
    })();
  }, []);

  const signIn = async (loginUsername: string, loginPassword: string) => {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(loginUsername),
      password: loginPassword,
    });
    if (authError) throw authError;
    window.localStorage.setItem(REMEMBERED_USERNAME_KEY, loginUsername.trim());
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signIn(username, password);

      if (biometricAvailable && rememberBiometric) {
        try {
          await enableBiometricLogin({ username: username.trim(), password });
          setBiometricReady(true);
        } catch (biometricError) {
          if (!wasBiometricPromptCancelled(biometricError)) {
            console.warn('Could not enable biometric login:', biometricError);
          }
        }
      }
    } catch (loginError) {
      setError('Username ama Password waa khalad!');
      console.error('Login error:', loginError);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setError(null);

    try {
      const credentials = await getBiometricLoginCredentials();
      if (!credentials) {
        setBiometricReady(false);
        setError('Fingerprint login lama diyaarin. Marka hore password-ka ku gal.');
        return;
      }

      setUsername(credentials.username);
      await signIn(credentials.username, credentials.password);
    } catch (biometricError) {
      if (wasBiometricPromptCancelled(biometricError)) return;

      console.error('Biometric login failed:', biometricError);
      await removeBiometricCredentials().catch(() => undefined);
      setBiometricReady(false);
      setError('Fingerprint login wuu fashilmay. Password-ka ku gal si dib loogu xiro.');
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-slate-800">
      <ThemeToggle className="fixed right-4 top-4 z-10 shadow-sm" />
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl ${
              settings.logo_url ? 'bg-transparent' : 'border border-teal-100 bg-teal-50 text-teal-600 shadow-sm'
            }`}
          >
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt={settings.org_name_en} className="h-full w-full object-contain" />
            ) : (
              <Shield className="h-8 w-8" />
            )}
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-850">
            {settings.org_name_so}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">
            {settings.org_name_en}
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            Fadlan geli aqoonsigaaga si aad u gasho
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs text-rose-600">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Username
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              placeholder="Geli username-kaaga (e.g. admin)"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 pr-12 text-slate-900 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                placeholder="Geli password-kaaga"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Qari password-ka' : 'Muuji password-ka'}
                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 transition-colors hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {biometricAvailable && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={rememberBiometric}
                onChange={(event) => setRememberBiometric(event.target.checked)}
                className="h-4 w-4 accent-teal-600"
              />
              <Fingerprint className="h-5 w-5 text-teal-600" />
              Fingerprint login ku xasuuso qalabkan
            </label>
          )}

          <button
            type="submit"
            disabled={loading || biometricLoading}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-4 font-bold text-white shadow-lg shadow-teal-500/5 transition-all hover:-translate-y-0.5 hover:bg-teal-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                SIGN IN <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          {biometricReady && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={loading || biometricLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-white px-5 py-4 font-bold text-teal-700 shadow-sm transition-all hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {biometricLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              ) : (
                <>
                  <Fingerprint className="h-5 w-5" /> KU GAL FINGERPRINT
                </>
              )}
            </button>
          )}
        </form>
      </div>
      <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {settings.org_name_so} &middot; {settings.org_name_en}
      </p>
    </div>
  );
}

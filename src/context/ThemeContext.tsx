'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'geosurvey-theme';
const THEME_CHANGE_EVENT = 'geosurvey-theme-change';

// Applies the theme to <html data-theme="..."> — globals.css swaps the whole slate/white
// CSS-variable palette based on this attribute, so nearly every bg-white/bg-slate-*/
// text-slate-* utility in the app repaints automatically without per-component dark:
// classes.
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

function getAppliedTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function subscribeToTheme(onChange: () => void) {
  const handleThemeChange = () => onChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || (event.newValue !== 'dark' && event.newValue !== 'light')) return;
    applyTheme(event.newValue);
    onChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline script in layout.tsx already set data-theme (and thus the real paint)
  // before hydration — this state just needs to agree with it so toggling works.
  const theme = useSyncExternalStore(subscribeToTheme, getAppliedTheme, (): Theme => 'light');

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The visual theme should still work when storage is blocked/private.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(getAppliedTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

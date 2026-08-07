'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface AppSettings {
  org_name_so: string;
  org_name_en: string;
  logo_url: string | null;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  reference_subjects: string[];
  land_types: string[];
  ref_number_prefix: string;
  ref_number_next_seq: number;
}

// Used until /api/public/settings resolves (or if the app_settings migration
// hasn't been applied yet) — mirrors the DB row's own defaults so dropdowns
// and branding text keep working exactly as before this feature existed.
const DEFAULT_SETTINGS: AppSettings = {
  org_name_so: 'Nootaayo Marwaaz',
  org_name_en: 'Marwaaz Public Notary',
  logo_url: null,
  contact_email: 'hssnmoalim@gmail.com',
  contact_phone: '+252 611122205',
  contact_address: 'Baidoa – Somalia',
  reference_subjects: [
    'Beec Dhul', 'Beec Gaari', 'Beec Mooto', 'Sugitaan Milkiyad Dhul',
    'Sugitaan Dhaxalkoob', 'Sugitaan Milkiyad Gaari/Koox/Nooc kale',
    'Codsi Sabarloog', 'Wakaalad', 'Damaanad', 'Heshiis', 'Cadeyn',
    'Cadeyn Heshiis Kiro', 'Xeer Hoosaad', 'Cadeyn Rahan', 'Qiimeyn Guri',
    'Cadeyn Hibeyn/ Waqaf',
  ],
  land_types: ['Dhul Banaan', 'Dhul dhisan'],
  ref_number_prefix: 'REF',
  ref_number_next_seq: 1,
};

interface SettingsContextType {
  settings: AppSettings;
  loading: boolean;
  refetch: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  refetch: async () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/public/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings((prev) => ({ ...prev, ...data.settings }));
      }
    } catch (err) {
      console.error('[Settings] Failed to load app settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refetch: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);

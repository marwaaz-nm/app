"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

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
  ref_number_format: string;
  ref_number_digits: number;
  survey_number_prefix: string;
  survey_number_next_seq: number;
  survey_number_format: string;
  survey_number_digits: number;
  receipt_number_prefix: string;
  receipt_number_next_seq: number;
  receipt_number_format: string;
  receipt_number_digits: number;
  expense_number_prefix: string;
  expense_number_next_seq: number;
  expense_number_format: string;
  expense_number_digits: number;
  survey_pdf_design: SurveyPdfDesignSettings;
}

export interface SurveyPdfDesignSettings {
  title: string;
  subtitle: string;
  accent: string;
  font: "Arial" | "Georgia" | "Times New Roman";
  density: "comfortable" | "compact";
  showLogo: boolean;
  showFooter: boolean;
  sections: {
    summary: boolean;
    boundaries: boolean;
    sketch: boolean;
    certification: boolean;
  };
  notes: string;
  fontSizes?: {
    title: number;
    subtitle: number;
    body: number;
    section: number;
    footer: number;
  };
  positions?: Record<string, { x: number; y: number }>;
  sketchSize?: { width: number; height: number };
  mapSize?: { width: number; height: number };
  textStyles?: Record<
    string,
    {
      color?: string;
      fontSize?: number;
      words?: Record<string, { color?: string; fontSize?: number }>;
    }
  >;
  tableStyle?: {
    headerFill: string;
    headerText: string;
    bodyFill: string;
    bodyText: string;
    fontSize: number;
    cells: Record<string, { fill?: string; color?: string; fontSize?: number }>;
  };
}

// Used until /api/public/settings resolves (or if the app_settings migration
// hasn't been applied yet) — mirrors the DB row's own defaults so dropdowns
// and branding text keep working exactly as before this feature existed.
const DEFAULT_SETTINGS: AppSettings = {
  org_name_so: "Nootaayo Marwaaz",
  org_name_en: "Marwaaz Public Notary",
  logo_url: null,
  contact_email: "hssnmoalim@gmail.com",
  contact_phone: "+252 611122205",
  contact_address: "Baidoa – Somalia",
  reference_subjects: [
    "Beec Dhul",
    "Beec Gaari",
    "Beec Mooto",
    "Sugitaan Milkiyad Dhul",
    "Sugitaan Dhaxalkoob",
    "Sugitaan Milkiyad Gaari/Koox/Nooc kale",
    "Codsi Sabarloog",
    "Wakaalad",
    "Damaanad",
    "Heshiis",
    "Cadeyn",
    "Cadeyn Heshiis Kiro",
    "Xeer Hoosaad",
    "Cadeyn Rahan",
    "Qiimeyn Guri",
    "Cadeyn Hibeyn/ Waqaf",
  ],
  land_types: ["Dhul Banaan", "Dhul dhisan"],
  ref_number_prefix: "REF",
  ref_number_next_seq: 1,
  ref_number_format: "PREFIX-YYYY-SEQ",
  ref_number_digits: 3,
  survey_number_prefix: "SURV",
  survey_number_next_seq: 1,
  survey_number_format: "PREFIX-YYYY-SEQ",
  survey_number_digits: 3,
  receipt_number_prefix: "REC",
  receipt_number_next_seq: 1,
  receipt_number_format: "PREFIX-YYYY-SEQ",
  receipt_number_digits: 3,
  expense_number_prefix: "EXP",
  expense_number_next_seq: 1,
  expense_number_format: "PREFIX-YYYY-SEQ",
  expense_number_digits: 3,
  survey_pdf_design: {
    title: "LAND SURVEY REPORT",
    subtitle: "Warbixinta Sahanka Dhulka",
    accent: "#2563eb",
    font: "Arial",
    density: "comfortable",
    showLogo: true,
    showFooter: true,
    sections: {
      summary: true,
      boundaries: true,
      sketch: true,
      certification: true,
    },
    notes: "",
    fontSizes: { title: 25, subtitle: 12, body: 12, section: 11, footer: 8 },
    positions: {},
    sketchSize: { width: 100, height: 230 },
    mapSize: { width: 100, height: 650 },
    textStyles: {},
    tableStyle: {
      headerFill: "#f1f5f9",
      headerText: "#0f172a",
      bodyFill: "#ffffff",
      bodyText: "#1e293b",
      fontSize: 12,
      cells: {},
    },
  },
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

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);

  const fetchSettings = useCallback(async () => {
    const requestId = ++requestSequence.current;
    try {
      // Settings are editable runtime data. Never reuse a browser/CDN response here,
      // especially immediately after saving, or the form is reset to stale values.
      const response = await fetch(
        `/api/public/settings?updated=${Date.now()}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      );
      if (response.ok) {
        const data = await response.json();
        // A slower, older request must not overwrite the result of a save/refetch.
        if (requestId === requestSequence.current) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
        }
      }
    } catch (err) {
      console.error("[Settings] Failed to load app settings:", err);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the external settings API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSettings();
  }, [fetchSettings]);

  return (
    <SettingsContext.Provider
      value={{ settings, loading, refetch: fetchSettings }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);

'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useModal } from '@/context/ModalContext';
import { formatReferenceNumber } from '@/lib/numbering';
import DriveConnectionsPanel from '@/components/DriveConnectionsPanel';
import ArchiveDriveConfigPanel from '@/components/ArchiveDriveConfigPanel';
import {
  Settings as SettingsIcon,
  UserCircle,
  Building2,
  ListChecks,
  Cloud,
  Archive,
  Loader2,
  Save,
  X,
  Plus,
  KeyRound,
  Monitor,
  Smartphone,
  Download,
  ChevronRight,
} from 'lucide-react';

type Tab = 'account' | 'organization' | 'options' | 'drive' | 'archive' | 'desktop';

const DESKTOP_INSTALLER_PARTS = 5;
const DESKTOP_INSTALLER_SIZE = 100583387;
const DESKTOP_INSTALLER_PART_URL = '/downloads/desktop-parts';
const DESKTOP_DOWNLOAD_CONCURRENCY = 2;
const DESKTOP_DOWNLOAD_ATTEMPTS = 3;

async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Authentication token is missing. Please log in again.');
  return fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

function ChipListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 min-h-[52px]">
        {items.length === 0 && <span className="text-xs font-medium text-slate-400 px-1 py-1.5">Wax fasal ah lama darin weli.</span>}
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
            {item}
            <button type="button" onClick={() => onChange(items.filter((i) => i !== item))} className="text-slate-400 hover:text-rose-500 cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          placeholder="Ku dar fasal cusub..."
          className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        <button type="button" onClick={addItem} className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 cursor-pointer transition-colors">
          <Plus className="h-3.5 w-3.5" /> Dar
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { profile, refetchProfile } = useAuth();
  const { settings, loading: settingsLoading, refetch: refetchSettings } = useSettings();
  const { showAlert } = useModal();
  const isAdmin = profile?.role === 'Admin';
  const canManageDriveConnections = profile?.username === 'samanor';

  const [tab, setTab] = useState<Tab>('account');

  // Account tab state
  const [fullname, setFullname] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Organization tab state
  const [orgNameSo, setOrgNameSo] = useState('');
  const [orgNameEn, setOrgNameEn] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  // Dropdown options tab state
  const [referenceSubjects, setReferenceSubjects] = useState<string[]>([]);
  const [landTypes, setLandTypes] = useState<string[]>([]);

  // Numbering settings states
  const [refPrefix, setRefPrefix] = useState('REF');
  const [refNextSeq, setRefNextSeq] = useState(1);
  const [refFormat, setRefFormat] = useState('PREFIX-YYYY-SEQ');
  const [refDigits, setRefDigits] = useState(3);

  const [surveyPrefix, setSurveyPrefix] = useState('SURV');
  const [surveyNextSeq, setSurveyNextSeq] = useState(1);
  const [surveyFormat, setSurveyFormat] = useState('PREFIX-YYYY-SEQ');
  const [surveyDigits, setSurveyDigits] = useState(3);

  const [receiptPrefix, setReceiptPrefix] = useState('REC');
  const [receiptNextSeq, setReceiptNextSeq] = useState(1);
  const [receiptFormat, setReceiptFormat] = useState('PREFIX-YYYY-SEQ');
  const [receiptDigits, setReceiptDigits] = useState(3);

  const [expensePrefix, setExpensePrefix] = useState('EXP');
  const [expenseNextSeq, setExpenseNextSeq] = useState(1);
  const [expenseFormat, setExpenseFormat] = useState('PREFIX-YYYY-SEQ');
  const [expenseDigits, setExpenseDigits] = useState(3);

  const [savingOptions, setSavingOptions] = useState(false);

  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [downloadingDesktop, setDownloadingDesktop] = useState(false);
  const [desktopDownloadProgress, setDesktopDownloadProgress] = useState(0);
  const [desktopDownloadEta, setDesktopDownloadEta] = useState<number | null>(null);

  useEffect(() => {
    setFullname(profile?.fullname || '');
  }, [profile]);

  useEffect(() => {
    setOrgNameSo(settings.org_name_so);
    setOrgNameEn(settings.org_name_en);
    setLogoUrl(settings.logo_url || '');
    setContactEmail(settings.contact_email);
    setContactPhone(settings.contact_phone);
    setContactAddress(settings.contact_address);
    setReferenceSubjects(settings.reference_subjects);
    setLandTypes(settings.land_types);

    setRefPrefix(settings.ref_number_prefix || 'REF');
    setRefNextSeq(settings.ref_number_next_seq || 1);
    setRefFormat(settings.ref_number_format || 'PREFIX-YYYY-SEQ');
    setRefDigits(settings.ref_number_digits || 3);

    setSurveyPrefix(settings.survey_number_prefix || 'SURV');
    setSurveyNextSeq(settings.survey_number_next_seq || 1);
    setSurveyFormat(settings.survey_number_format || 'PREFIX-YYYY-SEQ');
    setSurveyDigits(settings.survey_number_digits || 3);

    setReceiptPrefix(settings.receipt_number_prefix || 'REC');
    setReceiptNextSeq(settings.receipt_number_next_seq || 1);
    setReceiptFormat(settings.receipt_number_format || 'PREFIX-YYYY-SEQ');
    setReceiptDigits(settings.receipt_number_digits || 3);

    setExpensePrefix(settings.expense_number_prefix || 'EXP');
    setExpenseNextSeq(settings.expense_number_next_seq || 1);
    setExpenseFormat(settings.expense_number_format || 'PREFIX-YYYY-SEQ');
    setExpenseDigits(settings.expense_number_digits || 3);
  }, [settings]);

  const handleDesktopDownload = async () => {
    setDownloadingDesktop(true);
    setDesktopDownloadProgress(0);
    setDesktopDownloadEta(null);
    try {
      const startedAt = performance.now();
      let downloadedBytes = 0;
      const parts: Blob[] = new Array(DESKTOP_INSTALLER_PARTS);
      let nextPartIndex = 0;

      const downloadPart = async (index: number) => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= DESKTOP_DOWNLOAD_ATTEMPTS; attempt += 1) {
          let attemptBytes = 0;
          try {
            const response = await fetch(`${DESKTOP_INSTALLER_PART_URL}/${index + 1}`, {
              cache: 'no-store',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (!response.body) throw new Error('Jawaabta download-ka lama akhrin karo.');

            const reader = response.body.getReader();
            const chunks: ArrayBuffer[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value.slice().buffer as ArrayBuffer);
              attemptBytes += value.byteLength;
              downloadedBytes += value.byteLength;
              const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.1);
              const bytesPerSecond = downloadedBytes / elapsedSeconds;
              setDesktopDownloadEta(Math.ceil(
                Math.max(0, DESKTOP_INSTALLER_SIZE - downloadedBytes) / bytesPerSecond,
              ));
            }

            parts[index] = new Blob(chunks, { type: 'application/octet-stream' });
            setDesktopDownloadProgress((completed) => completed + 1);
            return;
          } catch (error) {
            downloadedBytes = Math.max(0, downloadedBytes - attemptBytes);
            lastError = error;
            if (attempt < DESKTOP_DOWNLOAD_ATTEMPTS) {
              await new Promise((resolve) => window.setTimeout(resolve, 1000 * (2 ** (attempt - 1))));
            }
          }
        }
        throw new Error(
          `Qaybta ${index + 1} way fashilantay 3 jeer. Hubi internet-ka kadibna mar kale isku day. ${lastError instanceof Error ? lastError.message : ''}`,
        );
      };

      const worker = async () => {
        while (nextPartIndex < DESKTOP_INSTALLER_PARTS) {
          const index = nextPartIndex;
          nextPartIndex += 1;
          await downloadPart(index);
        }
      };
      await Promise.all(
        Array.from({ length: DESKTOP_DOWNLOAD_CONCURRENCY }, () => worker()),
      );
      const installer = new Blob(parts, { type: 'application/octet-stream' });
      const downloadUrl = URL.createObjectURL(installer);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'Marwaazpn-App-Setup.exe';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      showAlert(
        'Download-ku wuu fashilmay',
        error instanceof Error ? error.message : 'Fadlan mar kale isku day.',
        'error',
      );
    } finally {
      setDownloadingDesktop(false);
      setDesktopDownloadEta(null);
    }
  };

  const handleSaveName = async () => {
    if (!profile || !fullname.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase.from('profiles').update({ fullname: fullname.trim() }).eq('id', profile.id);
      if (error) throw error;
      await refetchProfile();
      showAlert('Guul', 'Magacaaga waa la cusboonaysiiyey!', 'success');
    } catch (err: any) {
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 6) {
      showAlert('Cillad', 'Password-ku waa inuu ka koobnaadaa ugu yaraan 6 xaraf.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Cillad', 'Labada password ma is waafaqsana.', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showAlert('Guul', 'Password-kaaga waa la cusboonaysiiyey!', 'success');
    } catch (err: any) {
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveOrg = async () => {
    setSavingOrg(true);
    try {
      const res = await authenticatedFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          org_name_so: orgNameSo,
          org_name_en: orgNameEn,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          contact_address: contactAddress,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Cillad ayaa dhacday.');
      await refetchSettings();
      showAlert('Guul', 'Xogta nootaayada waa la cusboonaysiiyey!', 'success');
    } catch (err: any) {
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Authentication token is missing. Please log in again.');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cillad ayaa dhacday.');
      setLogoUrl(json.logo_url);
      await refetchSettings();
      showAlert('Guul', 'Logo-ga waa la cusboonaysiiyey!', 'success');
    } catch (err: any) {
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveOptions = async () => {
    setSavingOptions(true);
    try {
      const res = await authenticatedFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          reference_subjects: referenceSubjects,
          land_types: landTypes,

          ref_number_prefix: refPrefix.trim() || 'REF',
          ref_number_next_seq: refNextSeq,
          ref_number_format: refFormat,
          ref_number_digits: refDigits,

          survey_number_prefix: surveyPrefix.trim() || 'SURV',
          survey_number_next_seq: surveyNextSeq,
          survey_number_format: surveyFormat,
          survey_number_digits: surveyDigits,

          receipt_number_prefix: receiptPrefix.trim() || 'REC',
          receipt_number_next_seq: receiptNextSeq,
          receipt_number_format: receiptFormat,
          receipt_number_digits: receiptDigits,

          expense_number_prefix: expensePrefix.trim() || 'EXP',
          expense_number_next_seq: expenseNextSeq,
          expense_number_format: expenseFormat,
          expense_number_digits: expenseDigits,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Cillad ayaa dhacday.');
      await refetchSettings();
      showAlert('Guul', 'Liisaska iyo Nidaamka Lambarrada waa la cusboonaysiiyey!', 'success');
    } catch (err: any) {
      showAlert('Cillad', err.message || 'Cillad ayaa dhacday.', 'error');
    } finally {
      setSavingOptions(false);
    }
  };

  const tabs: {
    id: Tab;
    label: string;
    sublabel: string;
    icon: typeof UserCircle;
    adminOnly?: boolean;
    hidden?: boolean;
  }[] = [
    { id: 'account', label: 'Xisaabta (Account)', sublabel: 'Profile & Password', icon: UserCircle },
    { id: 'organization', label: 'Nootaayo (Notary)', sublabel: 'Org info & Logo', icon: Building2, adminOnly: true },
    { id: 'options', label: 'Liisaska (Options)', sublabel: 'Numbering & Format', icon: ListChecks, adminOnly: true },
    { id: 'drive', label: 'Drive Connections', sublabel: 'Google Drive sync', icon: Cloud, adminOnly: true, hidden: !canManageDriveConnections },
    { id: 'archive', label: 'Document Archive', sublabel: 'Archive Drive config', icon: Archive, adminOnly: true },
    { id: 'desktop', label: 'Desktop App', sublabel: 'Windows & Mobile app', icon: Monitor },
  ];

  const visibleTabs = tabs.filter((t) => (!t.adminOnly || isAdmin) && !t.hidden);

  return (
    <div className="p-4 md:p-8 mx-auto space-y-6 text-slate-800 w-full max-w-6xl">
      {/* Top Settings Header */}
      <div className="flex items-center gap-3.5 bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-200/80 shadow-sm w-full">
        <div className="bg-teal-50 text-teal-600 p-3 rounded-2xl border border-teal-100/80 shrink-0">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base md:text-xl font-black text-slate-900 leading-tight">Settings</h2>
          <p className="hidden sm:block text-[11px] md:text-xs text-slate-500 font-semibold mt-0.5">
            Maamulka xisaabtaada, nootaayada, iyo liisaska system-ka.
          </p>
        </div>
      </div>

      {/* 2-Column Layout: Sub-Sidebar on Left, Main Content on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sub-Sidebar Navigation Column */}
        <aside className="lg:col-span-4 xl:col-span-3.5 space-y-2">
          {/* Mobile Horizontal Pill Bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                    active ? 'bg-teal-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Desktop Vertical Sub-Sidebar */}
          <div className="hidden lg:block bg-white border border-slate-200/80 rounded-3xl p-3 shadow-sm sticky top-6">
            <p className="px-3 pt-2 pb-2.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
              Settings Menu
            </p>
            <nav className="space-y-1.5" aria-label="Settings sub-sidebar">
              {visibleTabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`group relative flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all duration-200 cursor-pointer ${
                      active
                        ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-extrabold tracking-[-0.01em]">
                        {t.label}
                      </span>
                      <span
                        className={`block truncate text-[10px] font-medium transition-colors ${
                          active ? 'text-white/80' : 'text-slate-400 group-hover:text-slate-500'
                        }`}
                      >
                        {t.sublabel}
                      </span>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 transition-all ${
                        active
                          ? 'translate-x-0 text-white/80 opacity-100'
                          : '-translate-x-1 text-slate-300 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                      }`}
                    />
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Active Content Column */}
        <main className="lg:col-span-8 xl:col-span-8.5 space-y-4">
          {tab === 'account' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-800">Magaca Buuxa (Full Name)</h3>
                <input
                  type="text"
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 px-5 py-2.5 text-xs font-bold text-white shadow-md cursor-pointer transition-all"
                >
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Keydi
                </button>
              </div>

              <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><KeyRound className="h-4 w-4 text-teal-600" /> Bedel Password-ka</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Password cusub"
                    className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Xaqiiji password-ka"
                    className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <button
                  onClick={handleSavePassword}
                  disabled={savingPassword}
                  className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 px-5 py-2.5 text-xs font-bold text-white shadow-md cursor-pointer transition-all"
                >
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Bedel Password
                </button>
              </div>
            </div>
          )}

          {tab === 'organization' && isAdmin && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-5 shadow-sm">
              {settingsLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Magaca Nootaayada (Somali)</label>
                      <input value={orgNameSo} onChange={(e) => setOrgNameSo(e.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Notary Name (English)</label>
                      <input value={orgNameEn} onChange={(e) => setOrgNameEn(e.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Logo</label>
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                        ) : (
                          <Building2 className="h-6 w-6 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={handleLogoFileChange}
                          disabled={uploadingLogo}
                          className="block w-full text-xs font-semibold text-slate-500 file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-2.5 file:text-xs file:font-bold file:text-white hover:file:bg-slate-900 disabled:opacity-60"
                        />
                        <p className="text-[10px] font-medium text-slate-400">PNG, JPEG, WEBP ama SVG — ugu badnaan 2MB.</p>
                        {uploadingLogo && (
                          <p className="flex items-center gap-1.5 text-[10px] font-bold text-teal-600">
                            <Loader2 className="h-3 w-3 animate-spin" /> Soo dirsanaya...
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email</label>
                      <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Telefoon (Phone)</label>
                      <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Cinwaanka (Address)</label>
                    <input value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <button
                    onClick={handleSaveOrg}
                    disabled={savingOrg}
                    className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 px-5 py-2.5 text-xs font-bold text-white shadow-md cursor-pointer transition-all"
                  >
                    {savingOrg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Keydi Isbeddellada
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'options' && isAdmin && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 shadow-sm">
              {settingsLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
              ) : (
                <>
                  <ChipListEditor label="Ujeedooyinka Reference (Subjects)" items={referenceSubjects} onChange={setReferenceSubjects} />
                  <div className="h-px bg-slate-100" />
                  <ChipListEditor label="Nooca Dhulka (Land Types)" items={landTypes} onChange={setLandTypes} />
                  <div className="h-px bg-slate-100" />
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                        Nidaamka Lambarrada & Qaab-dhismeedka Sumadaha (Numbering & Format Settings)
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        Halkan ka habee Prefix-ka, Pattern-ka (tusaale `SUMAD/00001/26` ama `REF-2026-001`), iyo lambarka xiga ee qayb kasta.
                      </p>
                    </div>

                    {/* 1. Official References */}
                    <NumberingCardBlock
                      title="1. Official References (Sumadaha Tixraaca)"
                      description="Nidaamka lambarrada dukumiintiyada tixraaca (References)"
                      prefix={refPrefix}
                      onPrefixChange={setRefPrefix}
                      format={refFormat}
                      onFormatChange={setRefFormat}
                      digits={refDigits}
                      onDigitsChange={setRefDigits}
                      nextSeq={refNextSeq}
                      onNextSeqChange={setRefNextSeq}
                      defaultPrefix="REF"
                    />

                    {/* 2. Survey Records */}
                    <NumberingCardBlock
                      title="2. Survey Records (Sahanka Dhulka)"
                      description="Nidaamka lambarrada dukumiintiyada sahanka (Surveys)"
                      prefix={surveyPrefix}
                      onPrefixChange={setSurveyPrefix}
                      format={surveyFormat}
                      onFormatChange={setSurveyFormat}
                      digits={surveyDigits}
                      onDigitsChange={setSurveyDigits}
                      nextSeq={surveyNextSeq}
                      onNextSeqChange={setSurveyNextSeq}
                      defaultPrefix="SURV"
                    />

                    {/* 3. Financial Receipts */}
                    <NumberingCardBlock
                      title="3. Financial Receipts (Rasiidka Lacagaha)"
                      description="Nidaamka lambarrada rasiidhada lacag bixinta (Receipts)"
                      prefix={receiptPrefix}
                      onPrefixChange={setReceiptPrefix}
                      format={receiptFormat}
                      onFormatChange={setReceiptFormat}
                      digits={receiptDigits}
                      onDigitsChange={setReceiptDigits}
                      nextSeq={receiptNextSeq}
                      onNextSeqChange={setReceiptNextSeq}
                      defaultPrefix="REC"
                    />

                    {/* 4. Expense Records */}
                    <NumberingCardBlock
                      title="4. Expense Records (Kharashka / Expenses)"
                      description="Nidaamka lambarrada risiidhada kharashka (Expenses)"
                      prefix={expensePrefix}
                      onPrefixChange={setExpensePrefix}
                      format={expenseFormat}
                      onFormatChange={setExpenseFormat}
                      digits={expenseDigits}
                      onDigitsChange={setExpenseDigits}
                      nextSeq={expenseNextSeq}
                      onNextSeqChange={setExpenseNextSeq}
                      defaultPrefix="EXP"
                    />
                  </div>

                  <button
                    onClick={handleSaveOptions}
                    disabled={savingOptions}
                    className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 px-5.5 py-3 text-xs font-bold text-white shadow-md cursor-pointer transition-all active:scale-95"
                  >
                    {savingOptions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Keydi Liisaska & Nidaamka Lambarrada
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'drive' && canManageDriveConnections && <DriveConnectionsPanel />}

          {tab === 'archive' && isAdmin && <ArchiveDriveConfigPanel />}

          {tab === 'desktop' && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="bg-teal-50 text-teal-600 p-2.5 rounded-xl border border-teal-100 shrink-0">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">Marwaazpn App — Desktop</h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      Soo deji app-ka desktop-ka ee Windows si aad system-ka uga shaqeyso window gaar ah, adigoon u baahnayn browser.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDesktopDownload}
                  disabled={downloadingDesktop}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-300 px-5 py-3 text-xs font-bold text-white shadow-md cursor-pointer disabled:cursor-wait transition-all"
                >
                  {downloadingDesktop ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloadingDesktop
                    ? `Soo dejinaya (${desktopDownloadProgress}/${DESKTOP_INSTALLER_PARTS})`
                    : 'Soo Deji (Windows .exe)'}
                </button>

                {downloadingDesktop && (
                  <p className="text-xs font-bold text-teal-700" aria-live="polite">
                    {desktopDownloadEta === null
                      ? 'Waqtiga haray waa la xisaabinayaa…'
                      : `Qiyaastii ${desktopDownloadEta} seconds ayaa haray`}
                  </p>
                )}

                <p className="text-[11px] text-slate-400 font-medium">
                  Installer-kan wuxuu u shaqeeyaa Windows 10/11. Kadib install-ka, app-ka wuxuu ku xirnaan doonaa internet-ka isla xogta browser-ka aad isticmaasho.
                </p>
              </div>

              <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl border border-emerald-100 shrink-0">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">Marwaazpn App — Android</h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      Soo deji APK-ga Android si aad app-ka ugu rakibto telefoonkaaga.
                    </p>
                  </div>
                </div>

                <a
                  href="https://github.com/marwaaz-nm/app/releases/download/mobile-v0.1.0/Marwaazpn-App.apk"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-3 text-xs font-bold text-white shadow-md cursor-pointer transition-all"
                >
                  <Download className="h-4 w-4" /> Soo Deji (Android APK)
                </a>

                <p className="text-[11px] text-slate-400 font-medium">
                  Android 7 ama ka cusub ayuu u shaqeeyaa. Haddii telefoonku ku weydiiyo, oggolow “Install unknown apps”.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const NumberingCardBlock = ({
  title,
  description,
  prefix,
  onPrefixChange,
  format,
  onFormatChange,
  digits,
  onDigitsChange,
  nextSeq,
  onNextSeqChange,
  defaultPrefix
}: {
  title: string;
  description: string;
  prefix: string;
  onPrefixChange: (val: string) => void;
  format: string;
  onFormatChange: (val: string) => void;
  digits: number;
  onDigitsChange: (val: number) => void;
  nextSeq: number;
  onNextSeqChange: (val: number) => void;
  defaultPrefix: string;
}) => {
  const preview = formatReferenceNumber({
    prefix: prefix.trim() || defaultPrefix,
    formatPattern: format,
    seq: nextSeq,
    digits: digits
  });

  return (
    <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">{title}</h4>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{description}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-100 text-[11px] font-black text-teal-700 shrink-0 shadow-xs">
          <span className="text-[9px] text-teal-500 uppercase tracking-wide">Tusaale:</span>
          <span>{preview}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Prefix</label>
          <input
            value={prefix}
            onChange={(e) => onPrefixChange(e.target.value)}
            placeholder={defaultPrefix}
            className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-bold"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Format Pattern</label>
          <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value)}
            className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-xs text-slate-900 focus:outline-none cursor-pointer font-bold"
          >
            <option value="PREFIX/SEQ/YY">PREFIX/SEQ/YY (e.g. SUMAD/00001/26)</option>
            <option value="PREFIX-YYYY-SEQ">PREFIX-YYYY-SEQ (e.g. REF-2026-001)</option>
            <option value="PREFIX/SEQ/YYYY">PREFIX/SEQ/YYYY (e.g. REF/0001/2026)</option>
            <option value="PREFIX-SEQ">PREFIX-SEQ (e.g. REF-001)</option>
            <option value="PREFIX/YYYY/SEQ">PREFIX/YYYY/SEQ (e.g. REF/2026/001)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Digit Padding</label>
          <select
            value={digits}
            onChange={(e) => onDigitsChange(parseInt(e.target.value, 10))}
            className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-xs text-slate-900 focus:outline-none cursor-pointer font-bold"
          >
            <option value={3}>3 Digits (001)</option>
            <option value={4}>4 Digits (0001)</option>
            <option value={5}>5 Digits (00001)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Lambarka Xiga (Next Seq)</label>
          <input
            type="number"
            min={1}
            value={nextSeq}
            onChange={(e) => onNextSeqChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-bold"
          />
        </div>
      </div>
    </div>
  );
};

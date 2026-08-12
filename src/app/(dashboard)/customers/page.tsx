'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ListLoadingSkeleton } from '@/components/Skeleton';
import {
  AlertTriangle,
  Cake,
  Check,
  Cloud,
  Copy,
  FileText,
  IdCard,
  Phone,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';

type CustomerRecord = {
  name: string | null;
  motherName: string | null;
  birthYear: string | null;
  idNumber: string | null;
  phones: string[];
  sourceFile: { id: string; name: string; webViewLink?: string };
  connectionName: string;
};

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Fadlan dib u gal.');
  return session.access_token;
}

// Reconstructs the person's details as a sentence in the same phrasing the notary
// documents themselves use, so it can be pasted straight into a new document.
function buildDocumentSentence(record: CustomerRecord): string {
  const parts: string[] = [record.name || 'Magac lama helin'];
  if (record.motherName) parts.push(`ina ${record.motherName}`);
  if (record.birthYear) parts.push(`dhashay ${record.birthYear}kii,`);
  parts.push('degan Baydhabo,');
  if (record.idNumber) parts.push(`leh Somali passport lr. ${record.idNumber},`);
  if (record.phones.length > 0) parts.push(`wata Tel: ${record.phones.join(', ')},`);
  parts.push('sawirkiisuna ku dhegan yahay warqadan');
  return parts.join(' ');
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
        <p className="truncate text-sm font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Each search can take 10-20s (a real Drive full-text search + downloading candidate
  // documents), so a user pausing mid-typing can easily have an earlier, now-stale
  // request still in flight when a later one is fired. Without this guard, whichever
  // response happens to arrive last wins — including an older, smaller partial-query
  // request resolving after the real one and silently overwriting correct results with
  // wrong (sometimes empty) ones. Only the response matching the most recently *fired*
  // request is applied.
  const searchSeqRef = useRef(0);

  const handleCopy = async (key: string, record: CustomerRecord) => {
    try {
      await navigator.clipboard.writeText(buildDocumentSentence(record));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      // Clipboard access can be denied by the browser; nothing useful to recover here.
    }
  };

  const runSearch = async (query: string) => {
    const seq = ++searchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      const response = await fetch(`/api/customers?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (seq !== searchSeqRef.current) return;
      if (!response.ok) throw new Error(result.error || 'Raadinta way fashilantay.');
      setResults(result.results || []);
      setSearched(true);
    } catch (searchError) {
      if (seq !== searchSeqRef.current) return;
      setError(searchError instanceof Error ? searchError.message : 'Raadinta way fashilantay.');
      setResults([]);
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      if (trimmed) {
        setActiveQuery(trimmed);
        void runSearch(trimmed);
      } else {
        setActiveQuery('');
        setResults([]);
        setSearched(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const clearSearch = () => {
    setSearchInput('');
    setActiveQuery('');
    setResults([]);
    setSearched(false);
  };

  const notConfigured = error?.includes('lama dejin');

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Macmiisha</h1>
        <p className="text-sm text-slate-500">
          Raadi nambar telefoon, magac, ama aqoonsi si aad u aragto xogta qofka ee ka soo baxday dukumintiyada Drive.
        </p>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tusaale: 0615404230, ama magaca qofka..."
            className="w-full bg-slate-50/60 border border-slate-200/80 rounded-xl md:rounded-2xl py-2.5 md:py-3.5 pl-10 md:pl-11 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Tirtir raadinta"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {activeQuery && !loading && (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Natiijooyinka &ldquo;{activeQuery}&rdquo; ({results.length})
          </p>
        )}
      </div>

      {loading ? (
        <ListLoadingSkeleton rows={4} />
      ) : error ? (
        <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-bold text-slate-700 max-w-md">{error}</p>
          {notConfigured && (
            <p className="text-xs text-slate-400 max-w-md">
              Admin-ka: buuxi GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY iyo GOOGLE_DRIVE_ROOT_FOLDER_ID ee .env.local.
            </p>
          )}
        </div>
      ) : !searched ? (
        <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-10 flex flex-col items-center gap-2 text-center">
          <Users className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">Ku bilow raadinta si aad xogta macmiisha u aragto.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-10 flex flex-col items-center gap-2 text-center">
          <Users className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">Wax natiijo ah lama helin.</p>
          <p className="text-xs text-slate-400 max-w-sm">
            Hubi in nambarka ama magaca si sax ah loo qoray. Xogta waxaa laga soo saaraa qoraalka dukumintiyada, sidaa darteed qaar dukumintiyo ah oo qaab aan caadi ahayn ku qoran ayaa laga yaabaa in aan la helin.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((record, index) => {
            const key = `${record.sourceFile.id}-${index}`;
            const isCopied = copiedKey === key;
            return (
            <div
              key={key}
              className="bg-white border border-slate-200/60 rounded-2xl md:rounded-3xl p-4 md:p-5 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <User className="h-5 w-5" />
                </span>
                <p className="min-w-0 flex-1 truncate text-base font-black text-slate-900">
                  {record.name || 'Magac lama helin'}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(key, record)}
                  aria-label="Koobiyee xogta qofka"
                  title="Koobiyee xogta qofka"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                    isCopied
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                      : 'border-slate-200 text-slate-400 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {record.motherName && <InfoRow icon={Users} label="Magaca Hooyada" value={record.motherName} />}
                {record.birthYear && <InfoRow icon={Cake} label="Sanadka Dhalashada" value={record.birthYear} />}
                {record.idNumber && <InfoRow icon={IdCard} label="Aqoonsiga" value={record.idNumber} />}
                {record.phones.map((phone) => (
                  <InfoRow key={phone} icon={Phone} label="Telefoon" value={phone} />
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
                <Cloud className="h-3 w-3 shrink-0" />
                {record.connectionName}
              </div>

              <Link
                href={record.sourceFile.webViewLink || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 transition-colors"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{record.sourceFile.name}</span>
              </Link>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

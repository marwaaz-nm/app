'use client';

import { useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import { useSettings } from '@/context/SettingsContext';
import { FileText, Calendar, MapPin, Loader2, ShieldCheck, ShieldX, Map as MapIcon, Compass, ArrowLeft, Download } from 'lucide-react';

// Leaflet touches `window` at import time, so it must never be pulled into
// the server-rendered bundle for this page — dynamic + ssr:false keeps it
// entirely client-side, same pattern used for MiniMap elsewhere in the app.
const PublicLandMap = dynamic(() => import('@/components/PublicLandMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-semibold text-teal-600">
      Mapka waa la soo gelinayaa...
    </div>
  ),
});

type PublicSurvey = {
  serial_no: number;
  owner_name: string;
  neighborhood: string;
  land_type: string;
  sketch_area?: string;
  gps_location?: string;
  polygon_boundary?: string;
  boundary_w_val?: string;
  boundary_w_neighbor?: string;
  boundary_b_val?: string;
  boundary_b_neighbor?: string;
  boundary_k_val?: string;
  boundary_k_neighbor?: string;
  boundary_g_val?: string;
  boundary_g_neighbor?: string;
};

const BOUNDARY_DIRECTIONS: { key: 'w' | 'b' | 'k' | 'g'; label: string }[] = [
  { key: 'w', label: 'Waqooyi (North)' },
  { key: 'b', label: 'Bari (East)' },
  { key: 'k', label: 'Koonfur (South)' },
  { key: 'g', label: 'Galbeed (West)' },
];

type PublicReference = {
  ref_number: string;
  subject: string;
  issue_date?: string;
  archive_file_name?: string | null;
  surveys: PublicSurvey | null;
};

export default function PublicReferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings } = useSettings();
  const [reference, setReference] = useState<PublicReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/public/references/${id}`);
        if (!response.ok) {
          if (active) setNotFound(true);
          return;
        }
        const data = await response.json();
        if (active) setReference(data.reference);
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-600 to-emerald-600 shadow-lg">
          <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white/30 shadow-lg ${
                settings.logo_url ? 'bg-white p-2' : 'bg-white/15 text-white'
              }`}
            >
              {settings.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo_url} alt={settings.org_name_en} className="h-full w-full object-contain" />
              ) : (
                <ShieldCheck className="h-7 w-7" />
              )}
            </div>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white backdrop-blur">
              <ShieldCheck className="h-3 w-3" /> Xaqiijin Rasmi ah
            </span>
            <p className="mt-3 text-lg font-black text-white">{settings.org_name_so}</p>
            <p className="text-[11px] font-semibold text-teal-50/80">{settings.org_name_en} · Document Verification</p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-12 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-semibold text-slate-500">Waa la soo gelinayaa...</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-rose-200 bg-white p-12 text-center shadow-sm">
            <ShieldX className="h-10 w-10 text-rose-500" />
            <p className="text-sm font-bold text-slate-700">Dukumiintigan lama helin.</p>
            <p className="text-xs font-medium text-slate-400">This reference does not exist or was removed.</p>
          </div>
        )}

        {!loading && !notFound && reference && (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white px-6 py-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-md">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-teal-600">Official Reference Record</p>
                <p className="text-xl font-black leading-tight text-slate-900">{reference.ref_number}</p>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Ujeedo (Subject)</span>
                  <div className="text-sm font-extrabold text-slate-800">{reference.subject}</div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Taariikhda</span>
                  <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {reference.issue_date ? new Date(reference.issue_date).toLocaleDateString('so-SO') : '-'}
                  </div>
                </div>
              </div>

              {reference.archive_file_name && (
                <a
                  href={`/api/public/references/${id}/document`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-extrabold text-teal-700 shadow-sm transition-all hover:bg-teal-100 active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  Soo Deji Dukumiintiga Asalka ah (PDF)
                </a>
              )}

              {reference.surveys && (
                <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5 space-y-4">
                  <div className="space-y-3">
                    <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-teal-600">
                      <MapPin className="h-3.5 w-3.5" /> Xogta Dhulka (Connected Land Survey)
                    </span>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400">Sahan Lr</span>
                        <span className="text-sm font-extrabold text-slate-800">#{reference.surveys.serial_no}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400">Milkiile</span>
                        <span className="text-sm font-extrabold text-slate-800">{reference.surveys.owner_name}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400">Xaafadda</span>
                        <span className="text-sm font-extrabold text-slate-800">{reference.surveys.neighborhood}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400">Cabbirka</span>
                        <span className="text-sm font-extrabold text-slate-800">{reference.surveys.sketch_area || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {BOUNDARY_DIRECTIONS.some(({ key }) => reference.surveys?.[`boundary_${key}_val` as keyof PublicSurvey]) && (
                    <div className="space-y-3 border-t border-teal-100 pt-4">
                      <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-teal-600">
                        <Compass className="h-3.5 w-3.5" /> Soohdimaha Dhulka (Boundaries)
                      </span>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {BOUNDARY_DIRECTIONS.map(({ key, label }) => {
                          const value = reference.surveys?.[`boundary_${key}_val` as keyof PublicSurvey];
                          const neighbor = reference.surveys?.[`boundary_${key}_neighbor` as keyof PublicSurvey];
                          if (!value) return null;
                          return (
                            <div key={key} className="rounded-xl border border-teal-100/70 bg-white p-3 shadow-sm">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <span className="text-sm font-extrabold text-slate-800">{value}m</span>
                                <span className="truncate text-[11px] font-semibold text-slate-500">{neighbor || '-'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {reference.surveys.polygon_boundary && (
                    <div className="border-t border-teal-100 pt-4">
                      <button
                        onClick={() => setShowMap(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-xs font-extrabold text-white shadow-md transition-all hover:bg-teal-500 active:scale-95 cursor-pointer"
                      >
                        <MapIcon className="h-4 w-4" />
                        Muuji Mapka Dhulka (View Land Map)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showMap && reference?.surveys?.polygon_boundary && (
        <div className="fixed inset-0 z-[999] bg-slate-200">
          <PublicLandMap polygonBoundary={reference.surveys.polygon_boundary} />

          <button
            type="button"
            onClick={() => setShowMap(false)}
            aria-label="Dib u noqo"
            className="absolute left-4 top-4 z-[600] flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

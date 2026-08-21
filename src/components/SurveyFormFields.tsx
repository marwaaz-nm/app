'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Compass, Ruler, User, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, MapPinned, Loader2 } from 'lucide-react';
import type { Survey } from '@/types';
import type { BoundaryInfo } from '@/lib/geoDirection';

const MiniMap = dynamic(() => import('@/components/MiniMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full bg-slate-50 border border-slate-200 rounded-3xl flex items-center justify-center text-xs text-slate-500">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
        <span>Raryaa maabka...</span>
      </div>
    </div>
  ),
});

const NEIGHBORHOODS = ['Waaberi', 'Towfiiq', 'Horseed', 'Cadaada', 'Berdaale', 'Isha', 'Howlwadaag', 'Salaamay'];
const BRANCHES = ['Laanta 1aad', 'Laanta 2aad', 'Laanta 3aad'];

export type SurveyDraft = Partial<Survey>;

interface SurveyFormFieldsProps {
  draft: SurveyDraft;
  onChange: (patch: SurveyDraft) => void;
  landTypes: string[];
}

// Shared by the "Add New Survey" page and the survey edit modal, so registering a
// parcel and correcting one later look and behave identically instead of drifting into
// two different designs over time.
export default function SurveyFormFields({ draft, onChange, landTypes }: SurveyFormFieldsProps) {
  const [compassHeading, setCompassHeading] = React.useState<number | null>(null);
  const [compassActive, setCompassActive] = React.useState(false);
  const [compassError, setCompassError] = React.useState<string | null>(null);
  const set = (patch: SurveyDraft) => onChange(patch);
  const str = (value: unknown) => (value == null ? '' : String(value));

  React.useEffect(() => {
    if (!compassActive) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const iosHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      const heading = typeof iosHeading === 'number'
        ? iosHeading
        : typeof event.alpha === 'number'
          ? (360 - event.alpha + 360) % 360
          : null;

      if (heading !== null) {
        setCompassHeading(Math.round(heading));
        setCompassError(null);
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, [compassActive]);

  const toggleCompass = async () => {
    if (compassActive) {
      setCompassActive(false);
      return;
    }

    setCompassError(null);
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setCompassError('Telefoonkan compass sensor ma taageerayo.');
      return;
    }

    try {
      const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof orientationEvent.requestPermission === 'function') {
        const permission = await orientationEvent.requestPermission();
        if (permission !== 'granted') {
          setCompassError('Oggolaanshaha compass-ka waa la diiday.');
          return;
        }
      }
      setCompassActive(true);
    } catch {
      setCompassError('Compass-ka lama furi karin. Hubi rukhsadda browser-ka.');
    }
  };

  const compassDirection = compassHeading === null
    ? null
    : [
        ['Waqooyi', 'N'],
        ['Waqooyi-Bari', 'NE'],
        ['Bari', 'E'],
        ['Koonfur-Bari', 'SE'],
        ['Koonfur', 'S'],
        ['Koonfur-Galbeed', 'SW'],
        ['Galbeed', 'W'],
        ['Waqooyi-Galbeed', 'NW'],
      ][Math.round(compassHeading / 45) % 8];

  const boundaryDirections = [
    {
      key: 'north', somali: 'Waqooyi', english: 'North', compass: 'N', icon: ArrowUp,
      valKey: 'boundary_w_val' as const, neighborKey: 'boundary_w_neighbor' as const,
      accent: 'from-blue-500 to-cyan-400', iconStyle: 'bg-blue-50 text-blue-600',
    },
    {
      key: 'east', somali: 'Bari', english: 'East', compass: 'E', icon: ArrowRight,
      valKey: 'boundary_b_val' as const, neighborKey: 'boundary_b_neighbor' as const,
      accent: 'from-violet-500 to-blue-500', iconStyle: 'bg-violet-50 text-violet-600',
    },
    {
      key: 'south', somali: 'Koonfur', english: 'South', compass: 'S', icon: ArrowDown,
      valKey: 'boundary_k_val' as const, neighborKey: 'boundary_k_neighbor' as const,
      accent: 'from-amber-400 to-orange-500', iconStyle: 'bg-amber-50 text-amber-600',
    },
    {
      key: 'west', somali: 'Galbeed', english: 'West', compass: 'W', icon: ArrowLeft,
      valKey: 'boundary_g_val' as const, neighborKey: 'boundary_g_neighbor' as const,
      accent: 'from-emerald-400 to-teal-500', iconStyle: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Info card */}
      <div className="bg-transparent md:bg-white border-0 md:border border-slate-200/60 rounded-none md:rounded-3xl p-0 md:p-8 space-y-6 shadow-none md:shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 text-[11px] font-black border border-teal-200/50">1</span>
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">
            MACLUUMAADKA GUUD (General Info)
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-12">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Magaca Milkiilaha (Owner Full Name)
            </label>
            <input
              type="text"
              required
              value={str(draft.owner_name)}
              onChange={(e) => set({ owner_name: e.target.value })}
              className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
              placeholder="Magaca oo saddexan (Somali)"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Xaafadda (Neighborhood)
            </label>
            <select
              required
              value={str(draft.neighborhood)}
              onChange={(e) => set({ neighborhood: e.target.value })}
              className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <option value="">Dooro...</option>
              {NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Laanta (Branch)
            </label>
            <select
              required
              value={str(draft.branch)}
              onChange={(e) => set({ branch: e.target.value })}
              className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <option value="">Dooro...</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Nawaaxiga (Vicinity)
            </label>
            <input
              type="text"
              value={str(draft.vicinity)}
              onChange={(e) => set({ vicinity: e.target.value })}
              className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
              placeholder="Tusaale: Masjidka weyn agtiisa"
            />
          </div>

          <div className="md:col-span-12">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Nooca Dhulka (Land Type)
            </label>
            <select
              required
              value={str(draft.land_type)}
              onChange={(e) => set({ land_type: e.target.value })}
              className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <option value="">Dooro...</option>
              {landTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {draft.land_type === 'Dhul dhisan' && (
            <div className="md:col-span-12 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-xs font-bold uppercase tracking-wider text-rose-600 mb-2">
                Waxa ku dhisan (Building Details)
              </label>
              <input
                type="text"
                required
                value={str(draft.built_details)}
                onChange={(e) => set({ built_details: e.target.value })}
                className="w-full rounded-2xl bg-slate-50/60 border border-rose-200/80 px-5 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                placeholder="Faahfaahin ka bixi guriga ama dhismaha ku yaal dhulka"
              />
            </div>
          )}
        </div>
      </div>

      {/* Boundary Card */}
      <div className="overflow-visible rounded-none border-0 bg-transparent shadow-none md:overflow-hidden md:rounded-3xl md:border md:border-slate-200 md:bg-white md:shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-transparent pb-3 sm:flex-row sm:items-center sm:justify-between md:bg-gradient-to-r md:from-white md:via-blue-50/50 md:to-white md:p-5 md:px-6">
          <div className="flex items-center gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)] md:h-11 md:w-11 md:rounded-2xl">
              <Compass className="h-4 w-4 md:h-5 md:w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-teal-600">Step 02</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">4 directions</span>
              </div>
              <h4 className="mt-1 text-sm font-black tracking-[-0.02em] text-slate-900">
                Soohdimaha Dhulka
              </h4>
              <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                Geli cabbirka iyo magaca deriska ee jiho kasta.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {compassDirection && compassActive && (
              <span className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-[10px] font-black text-teal-700">
                {compassHeading}° · {compassDirection[0]} ({compassDirection[1]})
              </span>
            )}
            <button
              type="button"
              onClick={toggleCompass}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black transition-colors ${compassActive ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-blue-200 bg-white text-teal-700 hover:bg-blue-50'}`}
            >
              <Compass className={`h-4 w-4 ${compassActive ? 'animate-pulse' : ''}`} />
              {compassActive ? 'Jooji compass' : 'Ogow jihada'}
            </button>
          </div>
        </div>

        {compassError && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700 md:mx-6">
            {compassError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 p-0 pt-4 sm:p-0 md:grid-cols-2 md:gap-4 md:p-6">
          {boundaryDirections.map((direction) => {
            const DirectionIcon = direction.icon;
            return (
              <fieldset
                key={direction.key}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_3px_14px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_26px_rgba(15,23,42,0.07)]"
              >
                <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${direction.accent}`} />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${direction.iconStyle}`}>
                      <DirectionIcon className="h-4 w-4" strokeWidth={2.4} />
                    </span>
                    <legend className="min-w-0">
                      <span className="block truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-800">
                        {direction.somali}
                      </span>
                      <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        {direction.english} boundary
                      </span>
                    </legend>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white shadow-sm">
                    {direction.compass}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Cabbirka
                    </span>
                    <span className="relative flex items-center">
                      <Ruler className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={str(draft[direction.valKey])}
                        onChange={(event) => set({ [direction.valKey]: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/60 py-3.5 pl-11 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/10 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                      />
                      <span className="pointer-events-none absolute right-4 text-[10px] font-bold text-slate-400">
                        m
                      </span>
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Magaca Deriska
                    </span>
                    <span className="relative flex items-center">
                      <User className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Geli magaca deriska"
                        value={str(draft[direction.neighborKey])}
                        onChange={(event) => set({ [direction.neighborKey]: event.target.value })}
                        className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/60 py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/10 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                      />
                    </span>
                  </label>
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>

      {/* Map & Coordinates */}
      <div className="overflow-visible rounded-none border-0 bg-transparent shadow-none md:overflow-hidden md:rounded-3xl md:border md:border-slate-200 md:bg-white md:shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-transparent pb-3 sm:flex-row sm:items-center sm:justify-between md:bg-gradient-to-r md:from-white md:via-blue-50/50 md:to-white md:p-5 md:px-6">
          <div className="flex items-center gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)] md:h-11 md:w-11 md:rounded-2xl">
              <MapPinned className="h-4 w-4 md:h-5 md:w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-teal-600">Step 03</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Satellite GIS</span>
              </div>
              <h4 className="mt-1 text-sm font-black tracking-[-0.02em] text-slate-900">Maabka Sahanka</h4>
              <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                Dooro goobta saxda ah, kadibna ku sawir soohdinta dhulka.
              </p>
            </div>
          </div>
          <span className="hidden rounded-xl border border-blue-100 bg-white px-3 py-2 text-[9px] font-extrabold uppercase tracking-[0.13em] text-teal-700 shadow-sm sm:block">
            Location &amp; Boundary
          </span>
        </div>

        <div className="p-0 pt-4 sm:p-0 md:p-6">
          <MiniMap
            gpsValue={str(draft.gps_location)}
            onGpsChange={(value) => set({ gps_location: value })}
            polygonValue={str(draft.polygon_boundary)}
            onPolygonChange={(value) => set({ polygon_boundary: value })}
            sketchDetailsValue={str(draft.sketch_dimensions)}
            labelPositionsValue={str(draft.boundary_label_positions)}
            onLabelPositionsChange={(value) => set({ boundary_label_positions: value })}
            boundaryInfo={{
              N: { val: draft.boundary_w_val, neighbor: draft.boundary_w_neighbor },
              E: { val: draft.boundary_b_val, neighbor: draft.boundary_b_neighbor },
              S: { val: draft.boundary_k_val, neighbor: draft.boundary_k_neighbor },
              W: { val: draft.boundary_g_val, neighbor: draft.boundary_g_neighbor },
            } as BoundaryInfo}
            onSketchDetailsChange={(value) => set({
              sketch_dimensions: value || undefined,
              sketch_area: value.split(' | ')[0]?.replace(/Area:|Area/gi, '').trim() || undefined,
            })}
          />
        </div>
      </div>
    </div>
  );
}

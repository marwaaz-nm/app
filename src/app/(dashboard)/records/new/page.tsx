'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Check, AlertCircle, Loader2, Compass, Ruler, User, ArrowUp, ArrowDown, ArrowRight, X, MapPinned } from 'lucide-react';
import Link from 'next/link';

// Dynamically import MiniMap (SSR false)
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

export default function NewRecordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [ownerName, setOwnerName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [branch, setBranch] = useState('');
  const [vicinity, setVicinity] = useState('');
  const [landType, setLandType] = useState('');
  const [builtDetails, setBuiltDetails] = useState('');

  // Boundaries (Measurement & Neighbor)
  const [wVal, setWVal] = useState('');
  const [wNeighbor, setWNeighbor] = useState('');
  const [bVal, setBVal] = useState('');
  const [bNeighbor, setBNeighbor] = useState('');
  const [kVal, setKVal] = useState('');
  const [kNeighbor, setKNeighbor] = useState('');
  const [gVal, setGVal] = useState('');
  const [gNeighbor, setGNeighbor] = useState('');

  const boundaryDirections = [
    {
      key: 'north',
      somali: 'Waqooyi',
      english: 'North',
      compass: 'N',
      icon: ArrowUp,
      value: wVal,
      setValue: setWVal,
      neighbor: wNeighbor,
      setNeighbor: setWNeighbor,
      accent: 'from-blue-500 to-cyan-400',
      iconStyle: 'bg-blue-50 text-blue-600',
    },
    {
      key: 'east',
      somali: 'Bari',
      english: 'East',
      compass: 'E',
      icon: ArrowRight,
      value: bVal,
      setValue: setBVal,
      neighbor: bNeighbor,
      setNeighbor: setBNeighbor,
      accent: 'from-violet-500 to-blue-500',
      iconStyle: 'bg-violet-50 text-violet-600',
    },
    {
      key: 'south',
      somali: 'Koonfur',
      english: 'South',
      compass: 'S',
      icon: ArrowDown,
      value: kVal,
      setValue: setKVal,
      neighbor: kNeighbor,
      setNeighbor: setKNeighbor,
      accent: 'from-amber-400 to-orange-500',
      iconStyle: 'bg-amber-50 text-amber-600',
    },
    {
      key: 'west',
      somali: 'Galbeed',
      english: 'West',
      compass: 'W',
      icon: ArrowLeft,
      value: gVal,
      setValue: setGVal,
      neighbor: gNeighbor,
      setNeighbor: setGNeighbor,
      accent: 'from-emerald-400 to-teal-500',
      iconStyle: 'bg-emerald-50 text-emerald-600',
    },
  ];

  // Map & Polygon Coordinates
  const [gpsLocation, setGpsLocation] = useState('');
  const [polygonBoundary, setPolygonBoundary] = useState('');
  const [sketchDetails, setSketchDetails] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!polygonBoundary) {
      setError('Fadlan ku sawir xariiqda dhulka (polygon boundary) maabka hoose ee satellite-ka.');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        owner_name: ownerName,
        neighborhood,
        branch,
        vicinity: vicinity || null,
        land_type: landType,
        built_details: builtDetails || null,
        boundary_w_val: wVal || null,
        boundary_w_neighbor: wNeighbor || null,
        boundary_b_val: bVal || null,
        boundary_b_neighbor: bNeighbor || null,
        boundary_k_val: kVal || null,
        boundary_k_neighbor: kNeighbor || null,
        boundary_g_val: gVal || null,
        boundary_g_neighbor: gNeighbor || null,
        gps_location: gpsLocation || null,
        polygon_boundary: polygonBoundary,
        sketch_area: sketchDetails.split(' | ')[0]?.replace(/Area:|Area/gi, '').trim() || null,
        sketch_dimensions: sketchDetails || null,
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Fadlan dib u gal si aad sahanka u kaydiso.');
      const response = await fetch('/api/surveys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        const overlapMessage = Array.isArray(result.overlaps) && result.overlaps.length
          ? ` Wuxuu ku dul dhacay: ${result.overlaps.map((item: { serial_no: number; owner_name: string; overlap_area_m2: number }) => `#${item.serial_no} ${item.owner_name} (${Number(item.overlap_area_m2).toFixed(1)} m²)`).join(', ')}.`
          : '';
        throw new Error(`${result.error || 'Kaydinta waa fashilantay.'}${overlapMessage}`);
      }

      router.push('/records');
      router.refresh();
    } catch (err: unknown) {
      console.error('Error saving survey record:', err);
      setError(err instanceof Error ? err.message : 'Cillad ayaa dhacday xilliga kaydinta sahnaka.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 form-card space-y-6 text-slate-800">
      {/* Back to records header */}
      <div className="flex items-center gap-4">
        <Link
          href="/records"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-850 transition-colors shadow-sm cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-xl font-black text-slate-800">Diiwaangelinta Cusub</h2>
          <p className="text-xs text-slate-500 mt-0.5 font-semibold">Foomka diiwaangelinta sahanka iyo milkiilaha dhulka.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-xs text-rose-600 border border-rose-100">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Registration Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        
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
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
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
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
              >
                <option value="">Dooro...</option>
                <option value="Waaberi">Waaberi</option>
                <option value="Towfiiq">Towfiiq</option>
                <option value="Horseed">Horseed</option>
                <option value="Cadaada">Cadaada</option>
                <option value="Berdaale">Berdaale</option>
                <option value="Isha">Isha</option>
                <option value="Howlwadaag">Howlwadaag</option>
                <option value="Salaamay">Salaamay</option>
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Laanta (Branch)
              </label>
              <select
                required
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
              >
                <option value="">Dooro...</option>
                <option value="Laanta 1aad">Laanta 1aad</option>
                <option value="Laanta 2aad">Laanta 2aad</option>
                <option value="Laanta 3aad">Laanta 3aad</option>
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Nawaaxiga (Vicinity)
              </label>
              <input
                type="text"
                value={vicinity}
                onChange={(e) => setVicinity(e.target.value)}
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
                value={landType}
                onChange={(e) => setLandType(e.target.value)}
                className="w-full rounded-2xl bg-slate-50/60 border border-slate-200/80 px-5 py-3.5 text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
              >
                <option value="">Dooro...</option>
                <option value="Dhul Banaan">Dhul Banaan</option>
                <option value="Dhul dhisan">Dhul dhisan</option>
              </select>
            </div>

            {/* Conditionally show "Waxa ku dhisan" details */}
            {landType === 'Dhul dhisan' && (
              <div className="md:col-span-12 animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-xs font-bold uppercase tracking-wider text-rose-600 mb-2">
                  Waxa ku dhisan (Building Details)
                </label>
                <input
                  type="text"
                  required
                  value={builtDetails}
                  onChange={(e) => setBuiltDetails(e.target.value)}
                  className="w-full rounded-2xl bg-slate-50/60 border border-rose-200/80 px-5 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  placeholder="Faahfaahin ka bixi guriga ama dhismaha ku yaal dhulka"
                />
              </div>
            )}
          </div>
        </div>

        {/* Boundary Card */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-white via-blue-50/50 to-white p-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]">
                <Compass className="h-5 w-5" />
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
            <div className="hidden items-center gap-1 rounded-xl border border-blue-100 bg-white p-1.5 shadow-sm sm:flex">
              {['N', 'E', 'S', 'W'].map((direction) => (
                <span key={direction} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-[9px] font-black text-slate-500">
                  {direction}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2 md:gap-4 md:p-6">
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
                          value={direction.value}
                          onChange={(event) => direction.setValue(event.target.value)}
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
                          value={direction.neighbor}
                          onChange={(event) => direction.setNeighbor(event.target.value)}
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
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-white via-blue-50/50 to-white p-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]">
                <MapPinned className="h-5 w-5" />
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

          <div className="p-4 sm:p-5 md:p-6">
            <MiniMap
              gpsValue={gpsLocation}
              onGpsChange={setGpsLocation}
              polygonValue={polygonBoundary}
              onPolygonChange={setPolygonBoundary}
              onSketchDetailsChange={setSketchDetails}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-4 pt-4 pb-12">
          <button
            type="button"
            onClick={() => router.push('/records')}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-650 border border-slate-200/60 px-4 py-2.5 text-sm font-bold transition-all cursor-pointer select-none active:scale-[0.98]"
          >
            <X className="h-4 w-4" />
            <span>Cancel</span>
          </button>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-600 disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-600/15 hover:shadow-teal-600/25 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer select-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

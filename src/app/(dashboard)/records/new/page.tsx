'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Check, AlertCircle, Loader2, Compass, Ruler, User, ArrowUp, ArrowDown, ArrowRight, X } from 'lucide-react';
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
  const { user } = useAuth();

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
      // 1. Fetch next serial number (max + 1)
      const { data: maxData, error: maxError } = await supabase
        .from('surveys')
        .select('serial_no')
        .order('serial_no', { ascending: false })
        .limit(1);

      if (maxError) throw maxError;
      const nextSerialNo = maxData && maxData.length > 0 ? maxData[0].serial_no + 1 : 1;

      // 3. Prepare payload for Supabase insertion
      const payload = {
        serial_no: nextSerialNo,
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
        created_by: user?.id
      };

      const { error: insertError } = await supabase
        .from('surveys')
        .insert([payload]);

      if (insertError) throw insertError;

      router.push('/records');
      router.refresh();
    } catch (err: any) {
      console.error('Error saving survey record:', err);
      setError(err.message || 'Cillad ayaa dhacday xilliga kaydinta sahnaka.');
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
        <div className="bg-transparent md:bg-white border-0 md:border border-slate-200/60 rounded-none md:rounded-3xl p-0 md:p-8 space-y-6 shadow-none md:shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 text-[11px] font-black border border-teal-200/50">2</span>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">
                SOOHDIMAHA DHULKA (Boundaries)
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">Geli cabirada iyo magacyada deriska ee afarta jiho.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:bg-slate-50/40 p-0 md:p-6 md:rounded-3xl border-0 md:border border-slate-200/60 md:shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]">
            {/* Waqooyi (North) */}
            <div className="p-0 md:p-5 bg-transparent md:bg-white border-0 md:border border-slate-200/80 md:hover:border-teal-500/30 md:hover:shadow-md rounded-none md:rounded-2xl space-y-4 transition-all duration-300 relative group border-b border-slate-200/60 pb-6 md:pb-0 last:border-0 last:pb-0">
              <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-12 rounded-b-full bg-teal-500/20 group-hover:bg-teal-500 transition-all duration-300" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">WAQOOYI (North)</label>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[9px] font-black shadow-sm">N</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <Ruler className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Cabirka"
                    value={wVal}
                    onChange={(e) => setWVal(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-8 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                  <span className="absolute right-3 text-[10px] font-bold text-slate-400 select-none">m</span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Deriska"
                    value={wNeighbor}
                    onChange={(e) => setWNeighbor(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-3 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                </div>
              </div>
            </div>

            {/* Bari (East) */}
            <div className="p-0 md:p-5 bg-transparent md:bg-white border-0 md:border border-slate-200/80 md:hover:border-teal-500/30 md:hover:shadow-md rounded-none md:rounded-2xl space-y-4 transition-all duration-300 relative group border-b border-slate-200/60 pb-6 md:pb-0 last:border-0 last:pb-0">
              <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-12 rounded-b-full bg-teal-500/20 group-hover:bg-teal-500 transition-all duration-300" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">BARI (East)</label>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[9px] font-black shadow-sm">E</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <Ruler className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Cabirka"
                    value={bVal}
                    onChange={(e) => setBVal(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-8 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                  <span className="absolute right-3 text-[10px] font-bold text-slate-400 select-none">m</span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Deriska"
                    value={bNeighbor}
                    onChange={(e) => setBNeighbor(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-3 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                </div>
              </div>
            </div>

            {/* Koonfur (South) */}
            <div className="p-0 md:p-5 bg-transparent md:bg-white border-0 md:border border-slate-200/80 md:hover:border-teal-500/30 md:hover:shadow-md rounded-none md:rounded-2xl space-y-4 transition-all duration-300 relative group border-b border-slate-200/60 pb-6 md:pb-0 last:border-0 last:pb-0">
              <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-12 rounded-b-full bg-teal-500/20 group-hover:bg-teal-500 transition-all duration-300" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">KOONFUR (South)</label>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[9px] font-black shadow-sm">S</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <Ruler className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Cabirka"
                    value={kVal}
                    onChange={(e) => setKVal(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-8 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                  <span className="absolute right-3 text-[10px] font-bold text-slate-400 select-none">m</span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Deriska"
                    value={kNeighbor}
                    onChange={(e) => setKNeighbor(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-3 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                </div>
              </div>
            </div>

            {/* Galbeed (West) */}
            <div className="p-0 md:p-5 bg-transparent md:bg-white border-0 md:border border-slate-200/80 md:hover:border-teal-500/30 md:hover:shadow-md rounded-none md:rounded-2xl space-y-4 transition-all duration-300 relative group border-b border-slate-200/60 pb-6 md:pb-0 last:border-0 last:pb-0">
              <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-12 rounded-b-full bg-teal-500/20 group-hover:bg-teal-500 transition-all duration-300" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">GALBEED (West)</label>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[9px] font-black shadow-sm">W</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <Ruler className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Cabirka"
                    value={gVal}
                    onChange={(e) => setGVal(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-8 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                  <span className="absolute right-3 text-[10px] font-bold text-slate-400 select-none">m</span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Deriska"
                    value={gNeighbor}
                    onChange={(e) => setGNeighbor(e.target.value)}
                    className="w-full rounded-xl bg-slate-50/50 border border-slate-200/80 pl-9 pr-3 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Map & Coordinates */}
        <div className="bg-transparent md:bg-white border-0 md:border border-slate-200/60 rounded-none md:rounded-3xl p-0 md:p-8 space-y-6 shadow-none md:shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 text-[11px] font-black border border-teal-200/50">3</span>
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">
              MAABKA SAHANKA (Satellite GIS & Sketch)
            </h4>
          </div>

          <MiniMap
            gpsValue={gpsLocation}
            onGpsChange={setGpsLocation}
            polygonValue={polygonBoundary}
            onPolygonChange={setPolygonBoundary}
            onSketchDetailsChange={setSketchDetails}
          />
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

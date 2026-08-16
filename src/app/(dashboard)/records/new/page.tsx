'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { ArrowLeft, Check, AlertCircle, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import SurveyFormFields, { type SurveyDraft } from '@/components/SurveyFormFields';
import { notifyDataChanged, PENDING_SURVEY_KEY } from '@/lib/useDataAutoRefresh';

export default function NewRecordPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SurveyDraft>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        owner_name: draft.owner_name,
        neighborhood: draft.neighborhood,
        branch: draft.branch,
        vicinity: draft.vicinity || null,
        land_type: draft.land_type,
        built_details: draft.built_details || null,
        boundary_w_val: draft.boundary_w_val || null,
        boundary_w_neighbor: draft.boundary_w_neighbor || null,
        boundary_b_val: draft.boundary_b_val || null,
        boundary_b_neighbor: draft.boundary_b_neighbor || null,
        boundary_k_val: draft.boundary_k_val || null,
        boundary_k_neighbor: draft.boundary_k_neighbor || null,
        boundary_g_val: draft.boundary_g_val || null,
        boundary_g_neighbor: draft.boundary_g_neighbor || null,
        gps_location: draft.gps_location || null,
        polygon_boundary: draft.polygon_boundary || null,
        sketch_area: draft.sketch_area || null,
        sketch_dimensions: draft.sketch_dimensions || null,
        boundary_label_positions: draft.boundary_label_positions || null,
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
          ? ` Wuxuu ku dul dhacay: ${result.overlaps.map((item: { serial_no: number; owner_name: string; overlap_area_m2: number }) => `${item.serial_no} ${item.owner_name} (${Number(item.overlap_area_m2).toFixed(1)} m²)`).join(', ')}.`
          : '';
        throw new Error(`${result.error || 'Kaydinta waa fashilantay.'}${overlapMessage}`);
      }

      if (response.status === 202 && result.queued) {
        window.dispatchEvent(new CustomEvent('marwaazpn-offline-queued'));
      } else if (result.survey) {
        // Carry the server-confirmed row across the route transition. This prevents a
        // newly saved survey from disappearing while the records page refetch starts.
        window.sessionStorage.setItem(PENDING_SURVEY_KEY, JSON.stringify(result.survey));
      }

      notifyDataChanged();
      router.replace(`/records?updated=${Date.now()}`);
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
          <h2 className="text-xl font-black text-slate-800">New Registration</h2>
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
        <SurveyFormFields
          draft={draft}
          onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
          landTypes={settings.land_types}
        />

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

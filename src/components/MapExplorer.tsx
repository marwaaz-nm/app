'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Survey } from '@/types';
import {
  Eye,
  EyeOff,
  Tag,
  MapPin,
  Satellite,
  Map as MapIcon,
  Search,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import L from 'leaflet';

interface MapExplorerProps {
  onViewDetails: (record: Survey) => void;
}

type LabelMode = 'name' | 'icon' | 'off';
type MapType = 'satellite' | 'street';

import { ALL_NEIGHBORHOODS, ALL_BRANCHES } from '@/lib/boundaryDetection';

const XAAFADA_OPTIONS = ALL_NEIGHBORHOODS;
const LAANTA_OPTIONS = ALL_BRANCHES;

export default function MapExplorer({ onViewDetails }: MapExplorerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const polygonLayersRef = useRef<L.Polygon[]>([]);
  const tooltipLayersRef = useRef<L.Tooltip[]>([]);

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  const [labelMode, setLabelMode] = useState<LabelMode>('name');
  const [mapType, setMapType] = useState<MapType>('satellite');
  const [panelOpen, setPanelOpen] = useState(false);

  // Search & filter state
  const [search, setSearch] = useState('');
  const [filterXaafada, setFilterXaafada] = useState('');
  const [filterLaanta, setFilterLaanta] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch surveys on mount
  useEffect(() => {
    const fetchSurveys = async () => {
      try {
        const { data, error } = await supabase
          .from('surveys')
          .select('*')
          .order('serial_no', { ascending: false });

        if (error) throw error;
        setSurveys(data || []);
      } catch (err) {
        console.error('Error fetching surveys for map:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSurveys();
  }, []);

  // Initialize Map (base map instance only, no tile layer)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [3.1192, 43.6498],
      zoom: 15,
      zoomControl: false,
      scrollWheelZoom: true,
      dragging: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Swap tile layer when map type changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const url =
      mapType === 'satellite'
        ? 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
        : 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

    const layer = L.tileLayer(url, {
      maxZoom: 22,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      // Zooming in/out swaps to a whole new tile grid, so some fresh downloading is
      // unavoidable — but these two options cut down how much: keepBuffer holds on to
      // more already-loaded tiles outside the viewport (so zooming back out re-shows
      // them instantly instead of re-fetching), and updateWhenZooming defers requesting
      // the new zoom level's tiles until the zoom gesture actually finishes, instead of
      // firing a burst of now-wasted requests for every intermediate frame while pinching
      // or scroll-zooming.
      keepBuffer: 6,
      updateWhenZooming: false,
    });

    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [mapType]);

  // Parse custom coordinate string
  const parsePolygonCoords = (polyString: string | undefined): [number, number][] => {
    if (!polyString || polyString === 'N/A' || polyString.trim() === '') return [];
    try {
      return polyString
        .split(';')
        .map((coord) => coord.trim())
        .filter((coord) => coord.length > 0)
        .map((c) => {
          const parts = c.split(',');
          return [parseFloat(parts[0]), parseFloat(parts[1])] as [number, number];
        });
    } catch (err) {
      console.error('Error parsing coordinates:', err, polyString);
      return [];
    }
  };

  // Apply search & filters
  const filteredSurveys = useMemo(() => {
    let list = [...surveys];

    if (search.trim() !== '') {
      const query = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.owner_name?.toLowerCase().includes(query) ||
          s.neighborhood?.toLowerCase().includes(query)
      );
    }

    if (filterXaafada) {
      list = list.filter((s) => s.neighborhood === filterXaafada);
    }
    if (filterLaanta) {
      list = list.filter((s) => s.branch === filterLaanta);
    }
    if (startDate) {
      const start = new Date(startDate);
      list = list.filter((s) => s.created_at && new Date(s.created_at) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      list = list.filter((s) => s.created_at && new Date(s.created_at) <= end);
    }

    return list;
  }, [surveys, search, filterXaafada, filterLaanta, startDate, endDate]);

  const activeFilterCount = [filterXaafada, filterLaanta, startDate, endDate].filter(Boolean).length;

  // Draw Polygons when filtered surveys, map, or label mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    polygonLayersRef.current.forEach((layer) => map.removeLayer(layer));
    polygonLayersRef.current = [];
    tooltipLayersRef.current = [];

    if (filteredSurveys.length === 0) return;

    const bounds: L.LatLngBounds[] = [];

    filteredSurveys.forEach((survey) => {
      const coords = parsePolygonCoords(survey.polygon_boundary);
      if (coords.length < 3) return;

      const polygon = L.polygon(coords, {
        color: '#FFD700',
        fillColor: '#FFFF00',
        fillOpacity: 0.35,
        weight: 3,
      }).addTo(map);

      polygonLayersRef.current.push(polygon);
      bounds.push(polygon.getBounds());

      if (labelMode !== 'off') {
        const label = L.tooltip({
          permanent: true,
          direction: 'center',
          className: labelMode === 'name' ? 'map-owner-label' : 'map-owner-icon',
        })
          .setContent(
            labelMode === 'name'
              ? survey.owner_name
              : '<span class="inline-flex" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45))"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.72 11.34 7.02 11.6a1 1 0 0 0 1.96 0C13.28 21.34 20 15.25 20 10c0-4.42-3.58-8-8-8z" fill="#2563eb"/><circle cx="12" cy="10" r="3" fill="#ffffff"/></svg></span>'
          )
          .setLatLng(polygon.getBounds().getCenter());

        polygon.bindTooltip(label);
        tooltipLayersRef.current.push(label);
      }

      const popupContent = document.createElement('div');
      popupContent.className = 'p-2 text-slate-900 font-sans min-w-[200px]';
      popupContent.innerHTML = `
        <h6 class="font-extrabold text-sm border-b pb-1.5 mb-1.5 text-slate-800">${survey.owner_name}</h6>
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs mb-3 text-slate-600">
          <div><span class="font-semibold">S/N:</span> ${survey.survey_no || survey.serial_no}</div>
          <div><span class="font-semibold">Xaafadda:</span> ${survey.neighborhood}</div>
          <div><span class="font-semibold">Nooca:</span> ${survey.land_type}</div>
          <div class="truncate"><span class="font-semibold">GPS:</span> ${survey.gps_location || 'N/A'}</div>
        </div>
        <button id="view-details-btn-${survey.id}" class="w-full bg-teal-600 hover:bg-teal-600 text-white text-xs py-1.5 px-3 rounded-lg font-bold shadow-sm cursor-pointer transition-all">
          Fiiri Faahfaahinta
        </button>
      `;

      popupContent.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target && target.id === `view-details-btn-${survey.id}`) {
          onViewDetails(survey);
          map.closePopup();
        }
      });

      polygon.bindPopup(popupContent);
    });

    if (bounds.length > 0) {
      const group = L.latLngBounds(bounds.map((b) => b.getNorthWest()));
      bounds.forEach((b) => group.extend(b));
      map.fitBounds(group, { padding: [50, 50] });
    }
  }, [filteredSurveys, loading, onViewDetails, labelMode]);

  const labelModeMeta: Record<LabelMode, { icon: React.ReactNode; label: string }> = {
    name: { icon: <Eye className="h-3.5 w-3.5" />, label: 'Name' },
    icon: { icon: <Tag className="h-3.5 w-3.5" />, label: 'Icon' },
    off: { icon: <EyeOff className="h-3.5 w-3.5" />, label: 'Off' },
  };

  const panelBody = (
    <div className="space-y-4">
      {/* Label display mode */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Owner Labels
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(labelModeMeta) as LabelMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLabelMode(mode)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-bold transition-all cursor-pointer ${
                      labelMode === mode
                        ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.15)]'
                        : 'border-slate-200/80 bg-slate-50/60 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {labelModeMeta[mode].icon}
                    {labelModeMeta[mode].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Map type */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Map Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMapType('satellite')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[10px] font-bold transition-all cursor-pointer ${
                    mapType === 'satellite'
                      ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.15)]'
                      : 'border-slate-200/80 bg-slate-50/60 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Satellite className="h-3.5 w-3.5" />
                  Satellite
                </button>
                <button
                  type="button"
                  onClick={() => setMapType('street')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[10px] font-bold transition-all cursor-pointer ${
                    mapType === 'street'
                      ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.15)]'
                      : 'border-slate-200/80 bg-slate-50/60 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  Street
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Raadi Magaca Milkiilaha ama Xaafadda..."
                className="w-full bg-slate-50/60 border border-slate-200/80 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all"
              />
            </div>

            {/* Xaafada / Laanta */}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterXaafada}
                onChange={(e) => setFilterXaafada(e.target.value)}
                className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-2.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer"
              >
                <option value="">Xaafad (All)</option>
                {XAAFADA_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>

              <select
                value={filterLaanta}
                onChange={(e) => setFilterLaanta(e.target.value)}
                className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-2.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all cursor-pointer"
              >
                <option value="">Laan (All)</option>
                {LAANTA_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-2.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl px-2.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white transition-all"
                />
              </div>
            </div>

      {(search || filterXaafada || filterLaanta || startDate || endDate) && (
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setFilterXaafada('');
            setFilterLaanta('');
            setStartDate('');
            setEndDate('');
          }}
          className="w-full rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <MapPin className="h-3 w-3" />
          Clear Filters
        </button>
      )}
    </div>
  );

  return (
    <div className="relative w-full h-full flex flex-col text-slate-800">
      {/* Desktop: compact pill + dropdown card */}
      <div className="pointer-events-none absolute right-4 top-4 md:right-6 md:top-6 z-[1000] hidden md:flex flex-col items-end gap-2 max-w-[92vw]">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          className="pointer-events-auto group flex items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-left shadow-xl shadow-slate-900/10 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-2xl active:translate-y-0 cursor-pointer"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs shadow-teal-600/20">
            <Sliders className="h-4 w-4" />
          </span>
          <div className="flex flex-col pr-1">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
              Map
            </span>
            <span className="block text-xs font-black text-slate-800">
              Filters &amp; Display
              {activeFilterCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-black text-white">
                  {activeFilterCount}
                </span>
              )}
            </span>
          </div>
          {panelOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {panelOpen && (
          <div className="pointer-events-auto w-[min(92vw,340px)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-md">
            {panelBody}
          </div>
        )}
      </div>

      {/* Mobile: compact icon-only button */}
      <div className="absolute right-3 top-3 z-[1000] md:hidden">
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-expanded={panelOpen}
          aria-label="Filters & Display"
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/90 bg-white/95 text-teal-600 shadow-xl shadow-slate-900/10 backdrop-blur-md active:scale-95 transition-all cursor-pointer"
        >
          <Sliders className="h-[18px] w-[18px]" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-teal-600 px-1 text-[8px] font-black text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile: filters bottom sheet */}
      {panelOpen && (
        <div className="fixed inset-0 z-[1100] md:hidden">
          <button
            type="button"
            aria-label="Xir filters"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-3 bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_-18px_45px_rgba(15,23,42,0.2)]">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                  Map
                </span>
                <span className="block text-sm font-black text-slate-800">Filters &amp; Display</span>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Xir"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            {panelBody}
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-20 animate-pulse bg-slate-100">
          <div className="absolute right-3 top-3 md:right-6 md:top-6 h-11 w-11 rounded-2xl bg-slate-200 md:h-[52px] md:w-[190px]" />
          <div className="absolute bottom-8 right-4 h-9 w-9 rounded-xl bg-slate-200" />
        </div>
      )}

      {/* Leaflet container */}
      <div ref={mapContainerRef} className="explorer-map w-full h-full z-0 bg-slate-100" />
    </div>
  );
}

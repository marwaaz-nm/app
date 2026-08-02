'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Survey } from '@/types';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import L from 'leaflet';

interface MapExplorerProps {
  onViewDetails: (record: Survey) => void;
}

export default function MapExplorer({ onViewDetails }: MapExplorerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polygonLayersRef = useRef<L.Polygon[]>([]);
  const tooltipLayersRef = useRef<L.Tooltip[]>([]);
  
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const updateLabelsVisibility = useCallback((visible: boolean) => {
    const tooltips = document.querySelectorAll('.map-owner-label');
    tooltips.forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = visible ? 'block' : 'none';
    });
  }, []);

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

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Google Satellite layer
    const satLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    });

    const map = L.map(mapContainerRef.current, {
      center: [3.1192, 43.6498],
      zoom: 15,
      layers: [satLayer],
      zoomControl: false,
      scrollWheelZoom: true,
      dragging: !L.Browser.mobile,
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

  // Draw Polygons when surveys or map loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    polygonLayersRef.current.forEach(layer => map.removeLayer(layer));
    polygonLayersRef.current = [];
    tooltipLayersRef.current = [];

    if (surveys.length === 0) return;

    const bounds: L.LatLngBounds[] = [];

    surveys.forEach((survey) => {
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

      const label = L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'map-owner-label',
      })
      .setContent(survey.owner_name)
      .setLatLng(polygon.getBounds().getCenter());

      polygon.bindTooltip(label);
      tooltipLayersRef.current.push(label);

      const popupContent = document.createElement('div');
      popupContent.className = 'p-2 text-slate-900 font-sans min-w-[200px]';
      popupContent.innerHTML = `
        <h6 class="font-extrabold text-sm border-b pb-1.5 mb-1.5 text-slate-800">${survey.owner_name}</h6>
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs mb-3 text-slate-600">
          <div><span class="font-semibold">S/N:</span> #${survey.serial_no}</div>
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
      const group = L.latLngBounds(bounds.map(b => b.getNorthWest()));
      bounds.forEach(b => group.extend(b));
      map.fitBounds(group, { padding: [50, 50] });
    }

    updateLabelsVisibility(showLabels);

  }, [surveys, loading, onViewDetails, showLabels, updateLabelsVisibility]);

  const handleToggleLabels = () => {
    const newState = !showLabels;
    setShowLabels(newState);
    updateLabelsVisibility(newState);
  };

  return (
    <div className="relative w-full h-full flex flex-col text-slate-800">
      {/* Parcel label control */}
      <div className="pointer-events-none absolute right-4 top-4 z-10">
        <button
          type="button"
          onClick={handleToggleLabels}
          aria-pressed={showLabels}
          aria-label={showLabels ? 'Hide parcel owner names' : 'Show parcel owner names'}
          className="pointer-events-auto group flex items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/95 p-2 pr-3 text-left shadow-[0_10px_30px_rgba(15,23,42,0.16)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_14px_34px_rgba(15,23,42,0.2)] active:translate-y-0"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              showLabels ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {showLabels ? <Eye className="h-[17px] w-[17px]" /> : <EyeOff className="h-[17px] w-[17px]" />}
          </span>

          <span className="hidden min-w-[74px] sm:block">
            <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Parcel labels
            </span>
            <span className="mt-0.5 block text-[11px] font-extrabold text-slate-800">
              {showLabels ? 'Names visible' : 'Names hidden'}
            </span>
          </span>

          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              showLabels ? 'bg-teal-600' : 'bg-slate-200'
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                showLabels ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/55 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            <span className="text-xs font-semibold text-slate-600">Raryaa maabka...</span>
          </div>
        </div>
      )}

      {/* Leaflet container */}
      <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-100" />
    </div>
  );
}

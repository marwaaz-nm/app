'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Survey } from '@/types';
import { Eye, EyeOff, MapPin, Loader2 } from 'lucide-react';
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

  }, [surveys, loading]);

  const updateLabelsVisibility = (visible: boolean) => {
    const tooltips = document.querySelectorAll('.map-owner-label');
    tooltips.forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = visible ? 'block' : 'none';
    });
  };

  const handleToggleLabels = () => {
    const newState = !showLabels;
    setShowLabels(newState);
    updateLabelsVisibility(newState);
  };

  return (
    <div className="relative w-full h-full flex flex-col text-slate-800">
      {/* Top Header controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center pointer-events-none">
        <div className="bg-slate-950/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-800 shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex items-center gap-3 pointer-events-auto">
          <MapPin className="h-5 w-5 text-teal-400 animate-pulse" />
          <div>
            <h4 className="font-extrabold text-sm text-slate-100">Map Explorer</h4>
            <p className="text-[10px] text-slate-400 font-semibold">Sahanka dhulka iyo cabiraada maabka.</p>
          </div>
        </div>

        <div className="bg-slate-950/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800 shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex items-center pointer-events-auto">
          <button
            onClick={handleToggleLabels}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              showLabels
                ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-[0_2px_10px_rgba(45,138,112,0.25)] hover:scale-105 active:scale-95'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            {showLabels ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span>Show Names</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-2.5 bg-slate-950/95 px-6 py-4 rounded-2xl border border-slate-800 shadow-2xl">
            <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
            <span className="text-xs text-slate-200 font-semibold">Raryaa maabka...</span>
          </div>
        </div>
      )}

      {/* Leaflet container */}
      <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-100" />
    </div>
  );
}

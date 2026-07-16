'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Compass, Fullscreen, Navigation, Loader2 } from 'lucide-react';
import L from 'leaflet';
import { useModal } from '@/context/ModalContext';

// Assign L to window so leaflet-draw can find it on the client
if (typeof window !== 'undefined') {
  (window as any).L = L;
  require('leaflet-draw');
}

interface MiniMapProps {
  gpsValue: string;
  onGpsChange: (value: string) => void;
  polygonValue: string;
  onPolygonChange: (value: string) => void;
  onSketchDetailsChange: (value: string) => void;
}

export default function MiniMap({
  gpsValue,
  onGpsChange,
  polygonValue,
  onPolygonChange,
  onSketchDetailsChange
}: MiniMapProps) {
  const { showAlert } = useModal();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const sketchContainerRef = useRef<HTMLDivElement>(null);
  
  const mapRef = useRef<L.Map | null>(null);
  const sketchMapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [showSketch, setShowSketch] = useState(false);
  const [locating, setLocating] = useState(false);

  // Initialize Drawing Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Satellite tiles
    const satLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    });

    const map = L.map(mapContainerRef.current, {
      center: [3.1192, 43.6498],
      zoom: 17,
      layers: [satLayer],
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Feature group for drawn items
    const drawnItems = new L.FeatureGroup().addTo(map);
    drawnItemsRef.current = drawnItems;

    // Add Draw control
    const drawControl = new (L.Control as any).Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: { color: '#3388ff', weight: 3 },
        },
        rectangle: {
          shapeOptions: { color: '#3388ff', weight: 3 },
        },
        circle: false,
        marker: false,
        polyline: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
      },
    });
    map.addControl(drawControl);

    // Draw Event Listener
    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);

      // Handle polygon coordinates
      const latlngs = layer.getLatLngs()[0] as L.LatLng[];
      const polyString = latlngs.map(c => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join('; ');
      onPolygonChange(polyString);

      // Update Center Coordinate as GPS Input
      const center = layer.getBounds().getCenter();
      onGpsChange(`${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`);

      // Draw Sketch
      generateSketch(latlngs, layer.getBounds());
    });

    // Invalidate size on container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync isExpanded state with Map invalidateSize
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
        if (drawnItemsRef.current && drawnItemsRef.current.getLayers().length > 0) {
          mapRef.current?.fitBounds(drawnItemsRef.current.getBounds());
        }
      }, 300);
    }
  }, [isExpanded]);

  // Geodesic/Planar Area Calculation in Sq Meters
  const calculateArea = (coords: L.LatLng[]) => {
    if (coords.length < 3) return 0;
    const latRad = (coords[0].lat * Math.PI) / 180;
    const metersPerLat = 111132.95 - 559.82 * Math.cos(2 * latRad) + 1.17 * Math.cos(4 * latRad);
    const metersPerLng = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);

    const projected = coords.map((c) => ({
      x: c.lng * metersPerLng,
      y: c.lat * metersPerLat,
    }));

    let area = 0;
    const n = projected.length;
    for (let i = 0; i < n; i++) {
      const p1 = projected[i];
      const p2 = projected[(i + 1) % n];
      area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area / 2);
  };

  // Helper to check if a point is inside the polygon (Ray-Casting algorithm)
  const isPointInPolygon = (point: L.LatLng, polygon: L.LatLng[]) => {
    const x = point.lng, y = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      const intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Helper to add dimension annotation lines in Sketch Map
  const addSketchDimension = (start: L.LatLng, end: L.LatLng, map: L.Map, allCoords: L.LatLng[]) => {
    const dist = map.distance(start, end).toFixed(1);
    const mid = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);

    let angle = Math.atan2(end.lat - start.lat, end.lng - start.lng) * 180 / Math.PI;
    if (angle > 90 || angle < -90) { angle += 180; }

    const dLat = end.lat - start.lat;
    const dLng = end.lng - start.lng;

    // Calculate winding order (Shoelace formula)
    let sum = 0;
    for (let i = 0; i < allCoords.length; i++) {
      const p1 = allCoords[i];
      const p2 = allCoords[(i + 1) % allCoords.length];
      sum += (p2.lng - p1.lng) * (p2.lat + p1.lat);
    }
    const isCCW = sum < 0;

    // Perpendicular vector pointing outward
    // For CCW, outward is to the right: (dLat, -dLng)
    // For CW, outward is to the left: (-dLat, dLng)
    let pLat = isCCW ? -dLng : dLng;
    let pLng = isCCW ? dLat : -dLat;

    // Normalize perpendicular vector
    const pLen = Math.sqrt(pLat * pLat + pLng * pLng);
    if (pLen > 0) {
      pLat /= pLen;
      pLng /= pLen;
    }

    const offset = 0.000025;
    let ox = pLng * offset;
    let oy = pLat * offset;

    // Check if the offset midpoint is inside the polygon; if so, flip it to the outside
    const testMid = L.latLng(mid.lat + oy, mid.lng + ox);
    if (isPointInPolygon(testMid, allCoords)) {
      ox = -ox;
      oy = -oy;
    }

    const p1 = L.latLng(start.lat + oy, start.lng + ox);
    const p2 = L.latLng(end.lat + oy, end.lng + ox);
    const labelPos = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);

    L.polyline([p1, p2], { color: '#3388ff', weight: 1.5, opacity: 0.8 }).addTo(map);

    const marker = L.marker(labelPos, {
      icon: L.divIcon({
        className: 'sketch-dist-label',
        html: `
          <div contenteditable="true" spellcheck="false" class="editable-field sketch-dimension-input" 
               style="transform: rotate(${-angle}deg); min-width: 40px;">
               ${dist}m
          </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0] 
      })
    }).addTo(map);

    // Disable map dragging when clicking/editing label
    marker.on('add', function() {
      const el = marker.getElement()?.querySelector('.editable-field');
      if (el) {
        L.DomEvent.disableClickPropagation(el as HTMLElement);
        L.DomEvent.on(el as HTMLElement, 'mousedown touchstart dblclick input blur', (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (ev.type === 'blur' || ev.type === 'input') {
            updateFormSketchDetails();
          }
        });
      }
    });
  };

  const generateSketch = (latlngs: L.LatLng[], bounds: L.LatLngBounds) => {
    setShowSketch(true);
    
    // Small delay to allow the sketch container DOM to be rendered
    setTimeout(() => {
      if (sketchMapRef.current) {
        sketchMapRef.current.remove();
        sketchMapRef.current = null;
      }

      if (!sketchContainerRef.current) return;

      const skMap = L.map(sketchContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
        dragging: !L.Browser.mobile,
        scrollWheelZoom: false,
      });

      L.polygon(latlngs, {
        color: '#000000',
        weight: 3,
        fillColor: '#f1f5f9',
        fillOpacity: 0.1,
      }).addTo(skMap);

      const center = bounds.getCenter();
      const area = calculateArea(latlngs).toFixed(2);

      // Add Area Label
      const areaMarker = L.marker(center, {
        icon: L.divIcon({
          className: 'sketch-area-label',
          html: `<div contenteditable="true" spellcheck="false" class="editable-field sketch-area-input">Area: ${area} m²</div>`,
          iconSize: [140, 40],
          iconAnchor: [70, 20]
        })
      }).addTo(skMap);

      // Disable click propagation for area label
      areaMarker.on('add', function() {
        const el = areaMarker.getElement()?.querySelector('.editable-field');
        if (el) {
          L.DomEvent.disableClickPropagation(el as HTMLElement);
          L.DomEvent.on(el as HTMLElement, 'mousedown touchstart dblclick input blur', (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (ev.type === 'blur' || ev.type === 'input') {
              updateFormSketchDetails();
            }
          });
        }
      });

      // Add Dimension Lines
      for (let i = 0; i < latlngs.length; i++) {
        const start = latlngs[i];
        const end = latlngs[(i + 1) % latlngs.length];
        addSketchDimension(start, end, skMap, latlngs);
      }

      skMap.invalidateSize();
      skMap.fitBounds(bounds.pad(0.25), { animate: false });
      sketchMapRef.current = skMap;

      // Initial save of details to parent form
      setTimeout(() => {
        updateFormSketchDetails();
      }, 100);

    }, 200);
  };

  const updateFormSketchDetails = () => {
    const areaInput = document.querySelector('.sketch-area-input') as HTMLElement;
    const dimensionInputs = document.querySelectorAll('.sketch-dimension-input');
    
    const areaText = areaInput ? areaInput.innerText.trim() : 'Area: N/A';
    const dims: string[] = [];
    dimensionInputs.forEach((el) => {
      dims.push((el as HTMLElement).innerText.trim());
    });

    const detailsString = `${areaText} | Dim: ${dims.join(' | ')}`;
    onSketchDetailsChange(detailsString);
  };

  const getLiveLocation = () => {
    if (!navigator.geolocation) {
      showAlert('Cillad', 'Browser-kaagu ma ogola Geolocation.', 'error');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        onGpsChange(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 18);
          
          if (markerRef.current) {
            markerRef.current.setLatLng([latitude, longitude]);
          } else {
            const marker = L.marker([latitude, longitude], { draggable: true }).addTo(mapRef.current);
            marker.on('dragend', (event) => {
              const markerPos = event.target.getLatLng();
              onGpsChange(`${markerPos.lat.toFixed(6)}, ${markerPos.lng.toFixed(6)}`);
            });
            markerRef.current = marker;
          }
        }
        setLocating(false);
      },
      (err) => {
        console.error('Error fetching location:', err);
        showAlert('Cillad', 'Ma suuragalin in GPS-kaaga la soo helo.', 'error');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleFullScreen = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col">
        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
          Location & Boundary (Sawir Polygon / Guji Maabka)
        </label>
        
        <div 
          className={`relative border border-slate-200/80 rounded-3xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all duration-300 bg-slate-100 z-0 ${
            isExpanded 
              ? 'fixed inset-0 z-40 md:left-72 pb-16 md:pb-0' 
              : 'h-[400px] w-full'
          }`}
        >
          <div ref={mapContainerRef} className="w-full h-full" />
          
          {/* Toggle Full Screen Button */}
          <button
            type="button"
            onClick={toggleFullScreen}
            className="absolute top-4 right-4 z-10 bg-white/95 hover:bg-slate-50 border border-slate-200/85 text-slate-700 p-2.5 rounded-xl cursor-pointer shadow-md backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Fullscreen className="h-4.5 w-4.5" />
          </button>

          {/* Bottom GPS Display Overlay */}
          <div className="absolute bottom-4 left-4 right-4 z-10 bg-slate-950/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-800 shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex items-center justify-between gap-4 max-w-xl mx-auto">
            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
              <Compass className="h-5 w-5 text-teal-400 shrink-0 animate-pulse" />
              <input
                type="text"
                readOnly
                value={gpsValue}
                placeholder="0.000000, 0.000000"
                className="bg-transparent border-none text-xs font-mono font-bold text-teal-400 focus:outline-none w-full truncate cursor-default"
              />
            </div>
            
            <button
              type="button"
              onClick={getLiveLocation}
              disabled={locating}
              className="flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition-all cursor-pointer select-none shrink-0 shadow-[0_4px_12px_rgba(45,138,112,0.15)]"
            >
              {locating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Navigation className="h-3.5 w-3.5" />
              )}
              <span>Auto GPS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Technical Sketch Preview Card */}
      {showSketch && (
        <div className="border border-slate-200/80 rounded-3xl overflow-hidden bg-white shadow-[0_8px_30px_rgb(0,0,0,0.02)] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-50/80 border-b border-slate-100 px-5 py-3.5 flex items-center gap-2 text-slate-800 font-extrabold text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-500 animate-pulse" />
            <span>Qaabka Dhulka (Sketch Blueprint Preview)</span>
          </div>
          <div className="p-4 bg-white">
            <div ref={sketchContainerRef} className="w-full h-[400px] border border-slate-200/60 rounded-2xl bg-white" />
            <p className="text-[10px] text-slate-500 mt-2 italic text-center font-semibold">
              * Waxaad laba-jeer gujin kartaa (Double Click) cabirada dhinacyada ama Area si aad wax uga bedesho haddii loo baahdo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

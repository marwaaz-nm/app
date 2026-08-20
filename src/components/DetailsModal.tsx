'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Survey, Reference } from '@/types';
import {
  X,
  Layers,
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  Clock,
  User,
  MapPin,
  Home,
  Compass,
  Ruler,
  Hash,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import L from 'leaflet';
import { useModal } from '@/context/ModalContext';
import { useSettings } from '@/context/SettingsContext';
import { supabase } from '@/lib/supabase';
import { getDirectionFromCenter, parseDirectionPositions, type BoundaryInfo, type CompassDirection } from '@/lib/geoDirection';

interface DetailsModalProps {
  record: Survey | null;
  onClose: () => void;
}

export default function DetailsModal({ record, onClose }: DetailsModalProps) {
  const { showAlert } = useModal();
  const { settings } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [isSatFullscreen, setIsSatFullscreen] = useState(false);
  const [isSketchFullscreen, setIsSketchFullscreen] = useState(false);
  const [showRefPanel, setShowRefPanel] = useState(false);
  const [linkedRefs, setLinkedRefs] = useState<Reference[]>([]);
  const [linkedRefsLoading, setLinkedRefsLoading] = useState(false);

  // Reference numbers (Nootaayo/Document Archive records) that were issued against this
  // specific land parcel — `references.survey_id` is the link. Fetched whenever a
  // different record is opened, independent of whether the side panel is visible yet, so
  // the toggle button can show a count right away.
  useEffect(() => {
    if (!record?.id) {
      setLinkedRefs([]);
      return;
    }
    let cancelled = false;
    setLinkedRefsLoading(true);
    supabase
      .from('references')
      .select('id, ref_number, subject, status, issue_date, created_at')
      .eq('survey_id', record.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setLinkedRefs((data as Reference[]) || []);
        setLinkedRefsLoading(false);
      });
    return () => { cancelled = true; };
  }, [record?.id]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const satelliteMapContainerRef = useRef<HTMLDivElement>(null);
  const sketchMapContainerRef = useRef<HTMLDivElement>(null);
  
  const satelliteMapRef = useRef<L.Map | null>(null);
  const sketchMapRef = useRef<L.Map | null>(null);
  const satTileLayerRef = useRef<L.TileLayer | null>(null);

  // Parse custom coordinate string e.g. "3.112,43.64; 3.113,43.65"
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

  // Parse boundary text e.g. "W:25(Ahmed) | B:30(Mohamed) | K:25(Ali) | G:30(Hussein)"
  const parseBoundaries = (rawSoohdin: string | undefined) => {
    if (!rawSoohdin) return [];
    const labelMap: Record<string, string> = { 'W': 'Waqooyi (North)', 'B': 'Bari (East)', 'K': 'Koonfur (South)', 'G': 'Galbeed (West)' };
    const directions = rawSoohdin.split(' | ');
    
    return directions.map(dir => {
      const parts = dir.split(':');
      if (parts.length === 2) {
        const jihadaCode = parts[0].trim();
        const jihadaName = labelMap[jihadaCode] || jihadaCode;
        const subParts = parts[1].split('(');
        const cabirka = subParts[0] ? subParts[0].trim() + 'm' : '-';
        const deriska = subParts[1] ? subParts[1].replace(')', '').trim() : '-';
        return { jihadaName, cabirka, deriska };
      }
      return null;
    }).filter(Boolean);
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

  // Helper to add dimension markers to the sketch map
  const addSketchDimension = (start: L.LatLng, end: L.LatLng, map: L.Map, allCoords: L.LatLng[], savedValue?: string | null) => {
    const computedDistance = map.distance(start, end).toFixed(3);
    const displayDistance = savedValue?.trim()
      ? savedValue.trim().replace(/\s*m(?:Â²|²)?$/i, '')
      : computedDistance;

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

    const offset = 0.000025; // Offset distance from polygon border
    let ox = pLng * offset;
    let oy = pLat * offset;

    // Check if the offset midpoint is inside the polygon; if so, flip it to the outside
    const mid = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);
    const testMid = L.latLng(mid.lat + oy, mid.lng + ox);
    if (isPointInPolygon(testMid, allCoords)) {
      ox = -ox;
      oy = -oy;
    }

    const p1 = L.latLng(start.lat + oy, start.lng + ox);
    const p2 = L.latLng(end.lat + oy, end.lng + ox);
    const labelPos = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);

    // Draw dimension polyline
    L.polyline([p1, p2], { color: '#3b82f6', weight: 1.5, opacity: 0.8 }).addTo(map);

    // Draw extension lines (CAD style connecting polygon corners to dimension lines)
    L.polyline([start, p1], { color: '#3b82f6', weight: 1, opacity: 0.5 }).addTo(map);
    L.polyline([end, p2], { color: '#3b82f6', weight: 1, opacity: 0.5 }).addTo(map);

    // Create editable dimension label (rotated)
    L.marker(labelPos, {
      icon: L.divIcon({
        className: 'sketch-dist-label',
        html: `
          <div contenteditable="true" spellcheck="false" class="editable-field"
               style="transform: translate(-50%, -50%) rotate(${-angle}deg); min-width: 45px; text-align: center;">
               <span class="dist-text">${displayDistance}</span>
          </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      })
    }).addTo(map);
  };

  // Labels one of the polygon's 4 main boundary sides with its real compass direction
  // (computed from the true bearing between the polygon's centroid and this segment's
  // midpoint — not the raw lat/lng-difference heuristic previously used, which drifted
  // off true north away from the equator) plus the matching Waqooyi/Bari/Koonfur/Galbeed
  // measurement and neighbor name typed into the survey record, e.g. "Waqooyi — 25m —
  // Axmed". Shared between the satellite map and the sketch, which otherwise had no
  // direction indicator on it at all and a screen-invisible (print-only) one respectively.
  // Computes where the automatic (bearing-based) label for a boundary segment would sit
  // — the segment's midpoint, nudged outward away from the polygon's interior.
  const computeAutoDirectionPosition = (start: L.LatLng, end: L.LatLng, allCoords: L.LatLng[]): L.LatLng => {
    const mid = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);
    const dLat = end.lat - start.lat;
    const dLng = end.lng - start.lng;
    let sum = 0;
    for (let i = 0; i < allCoords.length; i++) {
      const p1 = allCoords[i];
      const p2 = allCoords[(i + 1) % allCoords.length];
      sum += (p2.lng - p1.lng) * (p2.lat + p1.lat);
    }
    const isCCW = sum < 0;
    let pLat = isCCW ? -dLng : dLng;
    let pLng = isCCW ? dLat : -dLat;
    const pLen = Math.sqrt(pLat * pLat + pLng * pLng);
    if (pLen > 0) { pLat /= pLen; pLng /= pLen; }

    const offset = 0.00005;
    let ox = pLng * offset;
    let oy = pLat * offset;
    const testMid = L.latLng(mid.lat + oy, mid.lng + ox);
    if (isPointInPolygon(testMid, allCoords)) { ox = -ox; oy = -oy; }

    return L.latLng(mid.lat + oy, mid.lng + ox);
  };

  // Renders a single direction label marker at an exact position — either a manually
  // placed spot (from `boundary_label_positions`) or the automatic fallback computed
  // above.
  const renderDirectionLabel = (direction: CompassDirection, position: L.LatLng, map: L.Map, _boundaryInfo: BoundaryInfo, rotation = 0, size = 12) => {
    // The sketch already prints a length number on every edge, so the direction label
    // itself only needs the direction (and neighbor) — not a duplicate "Xm".
    const label = direction;
    L.marker(position, {
      icon: L.divIcon({
        className: 'boundary-direction-label',
        html: `<div class="boundary-direction-wrap" style="transform: translate(-50%, -50%) rotate(${rotation}deg);"><div class="boundary-direction-box" style="font-size:${size}px">${label}</div></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    }).addTo(map);
  };

  // Draws all 4 direction labels on a map. Manually placed positions (surveyor clicked
  // a direction button then tapped the map) win when present; any direction missing a
  // manual position falls back to the automatic bearing-based placement, so older
  // records saved before this feature still show all 4 labels.
  const addBoundaryDirectionLabels = (
    map: L.Map,
    latlngs: L.LatLng[],
    mainBoundaryIndices: Set<number>,
    center: { lat: number; lng: number },
    boundaryInfo: BoundaryInfo,
    manualPositions: ReturnType<typeof parseDirectionPositions>,
  ) => {
    const directions: CompassDirection[] = ['N', 'E', 'S', 'W'];
    const sharedDirectionFontSize = directions
      .map((direction) => manualPositions[direction]?.size)
      .find((size): size is number => typeof size === 'number') ?? 12;
    for (const direction of directions) {
      const manual = manualPositions[direction];
      if (manual) {
        renderDirectionLabel(direction, L.latLng(manual.lat, manual.lng), map, boundaryInfo, manual.rotation ?? 0, sharedDirectionFontSize);
        continue;
      }
      for (const idx of mainBoundaryIndices) {
        const start = latlngs[idx];
        const end = latlngs[(idx + 1) % latlngs.length];
        const mid = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);
        if (getDirectionFromCenter(center.lat, center.lng, mid.lat, mid.lng) === direction) {
          renderDirectionLabel(direction, computeAutoDirectionPosition(start, end, latlngs), map, boundaryInfo, 0, sharedDirectionFontSize);
          break;
        }
      }
    }
  };

  // Initialize satellite and sketch maps inside the modal
  useEffect(() => {
    if (!record || !record.polygon_boundary) return;

    let lastSatZoomTime = 0;
    const handleSatWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!satelliteMapRef.current) return;
      const now = Date.now();
      if (now - lastSatZoomTime < 250) return;
      lastSatZoomTime = now;
      if (e.deltaY < 0) {
        satelliteMapRef.current.zoomIn();
      } else if (e.deltaY > 0) {
        satelliteMapRef.current.zoomOut();
      }
    };

    let lastSkZoomTime = 0;
    const handleSkWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!sketchMapRef.current) return;
      const now = Date.now();
      if (now - lastSkZoomTime < 250) return;
      lastSkZoomTime = now;
      if (e.deltaY < 0) {
        sketchMapRef.current.zoomIn();
      } else if (e.deltaY > 0) {
        sketchMapRef.current.zoomOut();
      }
    };

    const timer = setTimeout(() => {
      // Clean up old maps
      if (satelliteMapRef.current) { satelliteMapRef.current.remove(); satelliteMapRef.current = null; }
      if (sketchMapRef.current) { sketchMapRef.current.remove(); sketchMapRef.current = null; }

      const coords = parsePolygonCoords(record.polygon_boundary);
      if (coords.length < 3) return;

      const polygon = L.polygon(coords);
      const bounds = polygon.getBounds();
      const latlngs = coords.map((c) => L.latLng(c));

      // Vertex-average center (not the bounding-box center) — this is what the
      // direction bearing is measured from, matching the reference point the segment
      // "main 4" selection below already reasons about.
      const vertexCenter = latlngs.reduce(
        (acc, c) => ({ lat: acc.lat + c.lat / latlngs.length, lng: acc.lng + c.lng / latlngs.length }),
        { lat: 0, lng: 0 },
      );

      const boundaryInfo: BoundaryInfo = {
        N: { val: record.boundary_w_val, neighbor: record.boundary_w_neighbor },
        E: { val: record.boundary_b_val, neighbor: record.boundary_b_neighbor },
        S: { val: record.boundary_k_val, neighbor: record.boundary_k_neighbor },
        W: { val: record.boundary_g_val, neighbor: record.boundary_g_neighbor },
      };
      const manualPositions = parseDirectionPositions(record.boundary_label_positions);
      const savedSketchParts = (record.sketch_dimensions || '').split('|').map((part) => part.trim());
      const savedSketchDimensions = savedSketchParts.slice(1).map((part, index) =>
        (index === 0 ? part.replace(/^Dim:\s*/i, '') : part).trim(),
      ).filter(Boolean);

      // The 4 longest sides are treated as the plot's "main" boundaries — the ones that
      // get a Waqooyi/Bari/Koonfur/Galbeed label — same selection both maps use.
      const segmentDistances = latlngs.map((startPt, idx) => {
        const endPt = latlngs[(idx + 1) % latlngs.length];
        return { index: idx, dist: L.latLng(startPt).distanceTo(L.latLng(endPt)) };
      });
      const mainBoundaryIndices = new Set(
        [...segmentDistances].sort((a, b) => b.dist - a.dist).slice(0, 4).map((s) => s.index),
      );

      // --- SATELLITE MAP INITIALIZATION ---
      if (satelliteMapContainerRef.current) {
        const satTile = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          crossOrigin: true
        });

        const satMap = L.map(satelliteMapContainerRef.current, {
          attributionControl: false,
          scrollWheelZoom: false, // Use our custom wheel handler instead
          zoomControl: false,
          dragging: true,
          touchZoom: true,
          preferCanvas: true,
          zoomSnap: 0.5, // allows half-level zoom increments for finer framing control
          // Both off so programmatic setZoom() (used during PDF export to grab
          // a sharper capture) swaps straight to the new tiles at full opacity
          // instead of showing a scaled snapshot of the old zoom level
          // cross-fading into the new one — that in-between frame was what
          // showed up as a washed-out ghost rectangle in the captured image.
          zoomAnimation: false,
          fadeAnimation: false,
        });

        // Center on the polygon, but zoomed out slightly to show some surrounding houses/streets
        const zoomLevel = satMap.getBoundsZoom(bounds) - 0.5;
        satMap.setView(bounds.getCenter(), zoomLevel);

        satTile.addTo(satMap);
        satTileLayerRef.current = satTile;

        L.polygon(coords, {
          color: '#eab308',
          weight: 2.5,
          fillColor: '#eab308',
          fillOpacity: 0.15
        }).addTo(satMap);

        L.control.zoom({ position: 'bottomright' }).addTo(satMap);

        // Leaflet owns gestures inside the canvas so mobile users can pan in every
        // direction with one finger and pinch-zoom with two fingers.
        satMap.getContainer().style.touchAction = 'none';

        satelliteMapRef.current = satMap;
        satelliteMapContainerRef.current.addEventListener('wheel', handleSatWheel, { passive: false });
      }

      // --- TECHNICAL SKETCH MAP INITIALIZATION ---
      if (sketchMapContainerRef.current) {
        const skMap = L.map(sketchMapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: true,
          touchZoom: true,
          scrollWheelZoom: false, // Use our custom wheel handler instead
          preferCanvas: true,
        });
        skMap.getContainer().style.backgroundColor = '#ffffff';
        // Match the satellite map's mobile pan and pinch behavior.
        skMap.getContainer().style.touchAction = 'none';

        L.polygon(coords, {
          color: '#0f172a',
          weight: 2.5,
          fillColor: '#dbeafe',
          fillOpacity: 0.42,
        }).addTo(skMap);

        const center = bounds.getCenter();

        // Add dimensions to each line segment (all sides get a length; only the 4 main
        // boundaries additionally get a Waqooyi/Bari/Koonfur/Galbeed direction label).
        for (let i = 0; i < latlngs.length; i++) {
          const start = latlngs[i];
          const end = latlngs[(i + 1) % latlngs.length];
          const midpoint = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);
          const direction = getDirectionFromCenter(vertexCenter.lat, vertexCenter.lng, midpoint.lat, midpoint.lng);
          const savedBoundaryValue = mainBoundaryIndices.has(i) ? boundaryInfo[direction]?.val : undefined;
          addSketchDimension(start, end, skMap, latlngs, savedSketchDimensions[i] || savedBoundaryValue);
        }
        addBoundaryDirectionLabels(skMap, latlngs, mainBoundaryIndices, vertexCenter, boundaryInfo, manualPositions);

        // Add Center Area Label
        const matchArea = record.sketch_dimensions?.match(/Area:\s*([^\s|]+)/i) || record.sketch_dimensions?.match(/Area\s*([^\s|]+)/i);
        const areaValue = matchArea ? matchArea[1] + ' m²' : 'N/A';

        L.marker(center, {
          icon: L.divIcon({
            className: 'sketch-area-label',
            html: `<div class="editable-field sketch-area-input">Area: ${areaValue}</div>`,
            iconSize: [140, 40],
            iconAnchor: [70, 20]
          })
        }).addTo(skMap);

        skMap.invalidateSize();
        skMap.fitBounds(bounds, { animate: false, padding: [60, 60] });
        L.control.zoom({ position: 'bottomright' }).addTo(skMap);
        sketchMapRef.current = skMap;
        sketchMapContainerRef.current.addEventListener('wheel', handleSkWheel, { passive: false });
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      if (satelliteMapContainerRef.current) {
        satelliteMapContainerRef.current.removeEventListener('wheel', handleSatWheel);
      }
      if (sketchMapContainerRef.current) {
        sketchMapContainerRef.current.removeEventListener('wheel', handleSkWheel);
      }
    };
  }, [record]);

  // Fullscreen Resize & Recenter Handlers
  useEffect(() => {
    if (satelliteMapRef.current && record?.polygon_boundary) {
      setTimeout(() => {
        const coords = parsePolygonCoords(record.polygon_boundary);
        if (coords.length >= 3) {
          const bounds = L.polygon(coords).getBounds();
          satelliteMapRef.current?.invalidateSize().fitBounds(bounds, { padding: [20, 20] });
        }
      }, 150);
    }
  }, [isSatFullscreen, record]);

  useEffect(() => {
    if (sketchMapRef.current && record?.polygon_boundary) {
      setTimeout(() => {
        const coords = parsePolygonCoords(record.polygon_boundary);
        if (coords.length >= 3) {
          const bounds = L.polygon(coords).getBounds();
          sketchMapRef.current?.invalidateSize().fitBounds(bounds, { padding: [20, 20] });
        }
      }, 150);
    }
  }, [isSketchFullscreen, record]);

  if (!mounted || !record) return null;
  const boundaries = parseBoundaries(record.boundary_w_val ? 
    `W:${record.boundary_w_val}(${record.boundary_w_neighbor}) | B:${record.boundary_b_val}(${record.boundary_b_neighbor}) | K:${record.boundary_k_val}(${record.boundary_k_neighbor}) | G:${record.boundary_g_val}(${record.boundary_g_neighbor})` 
    : record.built_details
  );
  const handlePrintPDF = async () => {
    if (!record) return;

    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .leaflet-container {
        background-color: #ffffff !important;
        background: #ffffff !important;
      }
      .sketch-dist-label .editable-field {
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #000000 !important;
        font-family: sans-serif !important;
        font-weight: bold !important;
        font-size: 12px !important;
        padding: 0 !important;
        text-align: center !important;
      }
      .sketch-dist-label .dist-text {
        font-size: 11px !important;
        color: #000000 !important;
        font-weight: bold !important;
      }
      .boundary-direction-box {
        background: #ffffff !important;
        box-shadow: none !important;
      }
      .sketch-area-label .modal-area-box {
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #000000 !important;
        font-family: sans-serif !important;
        font-weight: bold !important;
        font-size: 14px !important;
        padding: 0 !important;
        text-align: center !important;
      }
    `;

    let printContainer: HTMLDivElement | null = null;
    let offscreenHost: HTMLDivElement | null = null;

    try {
      document.head.appendChild(styleEl);
      showAlert('Sug fadlan...', 'PDF-ka ayaa la diyaarinayaa, fadlan sug...', 'info');

      const html2canvas = (await import('html2canvas')).default;

      // Helper to temporarily prepare Leaflet map elements for html2canvas
      const prepareMapForCapture = (container: HTMLDivElement) => {
        const restoredElements: { el: HTMLElement; transform: string; left: string; top: string }[] = [];
        
        const controls = Array.from(container.querySelectorAll('.leaflet-control, .leaflet-control-zoom, .leaflet-control-attribution'));
        const removedControls = controls.map(c => {
          const el = c as HTMLElement;
          const parent = el.parentNode;
          const nextSibling = el.nextSibling;
          if (parent) { parent.removeChild(el); }
          return { el, parent, nextSibling };
        });

        const parent = container.parentElement as HTMLElement;
        const originalParentStyle = parent ? parent.style.borderRadius : '';
        const originalParentOverflow = parent ? parent.style.overflow : '';
        const originalParentClassName = parent ? parent.className : '';
        if (parent) {
          parent.style.borderRadius = '0px';
          parent.style.overflow = 'visible';
          parent.className = parent.className.replace(/\brounded-\S+/g, '').replace('overflow-hidden', '');
        }

        const mapPane = container.querySelector('.leaflet-map-pane') as HTMLElement;
        if (mapPane) {
          const style = window.getComputedStyle(mapPane);
          const transform = style.transform || style.webkitTransform;
          
          if (transform && transform !== 'none') {
            let tx = 0, ty = 0;
            if (transform.startsWith('matrix3d')) {
              const parts = transform.replace('matrix3d(', '').replace(')', '').split(',').map(parseFloat);
              if (parts.length >= 16) { tx = parts[12]; ty = parts[13]; }
            } else if (transform.startsWith('matrix')) {
              const parts = transform.replace('matrix(', '').replace(')', '').split(',').map(parseFloat);
              if (parts.length >= 6) { tx = parts[4]; ty = parts[5]; }
            }
            
            if (tx !== 0 || ty !== 0) {
              restoredElements.push({
                el: mapPane,
                transform: mapPane.style.transform,
                left: mapPane.style.left,
                top: mapPane.style.top
              });
              
              const currentLeft = parseFloat(style.left) || 0;
              const currentTop = parseFloat(style.top) || 0;
              
              mapPane.style.transform = 'none';
              mapPane.style.left = `${currentLeft + tx}px`;
              mapPane.style.top = `${currentTop + ty}px`;
            }
          }
        }
        
        return () => {
          if (parent) {
            parent.style.borderRadius = originalParentStyle;
            parent.style.overflow = originalParentOverflow;
            parent.className = originalParentClassName;
          }
          removedControls.forEach(({ el, parent, nextSibling }) => {
            if (parent) { parent.insertBefore(el, nextSibling); }
          });
          restoredElements.forEach(({ el, transform, left, top }) => {
            el.style.transform = transform;
            el.style.left = left;
            el.style.top = top;
          });
        };
      };

      // Pre-crop a captured canvas to a fixed aspect ratio (center-crop, like
      // object-fit:cover) so the embedded <img> needs no CSS-level fitting.
      // html2pdf's own html2canvas pass (which rasterizes the final assembled
      // page) does not honor object-fit and stretches images to fill their
      // box instead of cropping, which is what was squeezing the photo.
      const cropCanvasToAspect = (source: HTMLCanvasElement, targetRatio: number) => {
        const sourceRatio = source.width / source.height;
        let sx = 0, sy = 0, sw = source.width, sh = source.height;
        if (sourceRatio > targetRatio) {
          sw = source.height * targetRatio;
          sx = (source.width - sw) / 2;
        } else {
          sh = source.width / targetRatio;
          sy = (source.height - sh) / 2;
        }
        const out = document.createElement('canvas');
        out.width = sw;
        out.height = sh;
        out.getContext('2d')?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
        return out;
      };

      // 1. Capture Satellite Map
      let satImage = '';
      if (satelliteMapContainerRef.current && satelliteMapRef.current) {
        const satMap = satelliteMapRef.current;
        const container = satelliteMapContainerRef.current;
        const originalInlineWidth = container.style.width;
        const originalInlineHeight = container.style.height;
        let restoreMap: (() => void) | null = null;
        try {
          // Capture at the SAME zoom level as the live view (so the
          // surrounding plots/streets stay visible), but temporarily at a
          // much larger on-screen pixel size. Leaflet fills the extra space
          // with more real tiles at that zoom, giving genuinely more detail
          // instead of us upscaling a small capture afterward — zooming in
          // instead would have shown less area, which is the tradeoff we're
          // avoiding here.
          container.style.width = '720px';
          container.style.height = '850px';
          satMap.invalidateSize({ animate: false });
          await new Promise<void>((resolve) => {
            const tileLayer = satTileLayerRef.current;
            if (!tileLayer) { resolve(); return; }
            const done = () => resolve();
            tileLayer.once('load', done);
            setTimeout(done, 1200); // fallback in case tiles are already cached and 'load' never fires
          });
          await new Promise((resolve) => setTimeout(resolve, 150)); // settle buffer

          restoreMap = prepareMapForCapture(container);

          const satCanvas = await html2canvas(container, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            logging: false,
            backgroundColor: '#ffffff'
          });
          // Match the tall satellite frame in the supplied second-page template.
          const satCropped = cropCanvasToAspect(satCanvas, 658 / 780);
          satImage = satCropped.toDataURL('image/jpeg', 0.95);
        } catch (e) {
          console.error('Failed to capture satellite map', e);
        } finally {
          restoreMap?.();
          container.style.width = originalInlineWidth;
          container.style.height = originalInlineHeight;
          satMap.invalidateSize({ animate: false });
        }
      }

      // 2. Capture Technical Sketch Map
      let sketchImage = '';
      if (sketchMapContainerRef.current) {
        const sketchContainer = sketchMapContainerRef.current;
        const sketchMap = sketchMapRef.current;
        const originalSketchWidth = sketchContainer.style.width;
        const originalSketchHeight = sketchContainer.style.height;
        sketchContainer.style.width = '680px';
        sketchContainer.style.height = '390px';
        sketchMap?.invalidateSize({ animate: false });
        const pdfSketchCoords = parsePolygonCoords(record.polygon_boundary);
        if (pdfSketchCoords.length >= 3) {
          const pdfSketchBounds = L.latLngBounds(pdfSketchCoords);
          Object.values(parseDirectionPositions(record.boundary_label_positions)).forEach((position) => {
            if (position) pdfSketchBounds.extend([position.lat, position.lng]);
          });
          sketchMap?.fitBounds(pdfSketchBounds, { animate: false, padding: [20, 20] });
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const restoreSketch = prepareMapForCapture(sketchContainer);

        // The supplied template does not show the total-area badge inside the sketch.
        const areaMarker = sketchContainer.querySelector('.sketch-area-label') as HTMLElement | null;
        const originalAreaDisplay = areaMarker?.style.display || '';
        if (areaMarker) areaMarker.style.display = 'none';

        const originalStyles = new Map<any, any>();
        sketchMapRef.current?.eachLayer((layer: any) => {
          if (layer.setStyle) {
            originalStyles.set(layer, {
              color: layer.options.color,
              weight: layer.options.weight,
              fillColor: layer.options.fillColor,
              fillOpacity: layer.options.fillOpacity
            });

            if (layer instanceof L.Polygon) {
              layer.setStyle({
                color: '#0f172a',
                weight: 2.5,
                fillColor: '#dbeafe',
                fillOpacity: 0.42,
                opacity: 1
              });
            }
            // Plain Polyline instances are the dimension/extension lines —
            // left untouched so they keep their blue design color in the PDF.
          }
        });

        // Leaflet's Canvas renderer batches setStyle repaints into the next
        // animation frame, so wait for one to actually land before capturing —
        // otherwise html2canvas grabs the pre-restyle (blue) pixels.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
          const sketchCanvas = await html2canvas(sketchMapContainerRef.current, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            logging: false,
            backgroundColor: '#ffffff'
          });
          const cropX = Math.round(sketchCanvas.width * 0.08);
          const cropY = Math.round(sketchCanvas.height * 0.04);
          const croppedSketch = document.createElement('canvas');
          croppedSketch.width = sketchCanvas.width - cropX * 2;
          croppedSketch.height = sketchCanvas.height - cropY * 2;
          croppedSketch.getContext('2d')?.drawImage(
            sketchCanvas,
            cropX,
            cropY,
            croppedSketch.width,
            croppedSketch.height,
            0,
            0,
            croppedSketch.width,
            croppedSketch.height,
          );
          sketchImage = croppedSketch.toDataURL('image/jpeg', 0.95);
        } catch (e) {
          console.error('Failed to capture sketch map', e);
        } finally {
          originalStyles.forEach((style, layer) => {
            layer.setStyle(style);
          });
          if (areaMarker) areaMarker.style.display = originalAreaDisplay;
          restoreSketch();
          sketchContainer.style.width = originalSketchWidth;
          sketchContainer.style.height = originalSketchHeight;
          sketchMap?.invalidateSize({ animate: false });
          if (pdfSketchCoords.length >= 3) {
            sketchMap?.fitBounds(L.polygon(pdfSketchCoords).getBounds(), { animate: false, padding: [60, 60] });
          }
        }
      }

      const gpsParts = record.gps_location ? record.gps_location.split(',') : [];
      const latVal = gpsParts[0] ? gpsParts[0].trim() : 'N/A';
      const lngVal = gpsParts[1] ? gpsParts[1].trim() : 'N/A';
      const areaClean = record.sketch_area ? record.sketch_area.replace(' m²', '').replace('m²', '').trim() : 'N/A';
      const issueDate = record.created_at ? new Date(record.created_at).toLocaleDateString('en-GB') : '-';

      const cleanVal = (val: string | undefined) => {
        if (!val) return '-';
        return val.replace('m', '').replace('M', '').trim();
      };

      const watermarkHTML = `
        <div style="position:absolute;top:51%;left:50%;transform:translate(-50%,-50%);width:330px;height:330px;opacity:0.035;pointer-events:none;z-index:0;">
          <img src="/icon.png" alt="" style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `;

      const headerHTML = `
        <div style="display:grid;grid-template-columns:1fr 96px 1fr;gap:16px;align-items:center;padding:4px 0 14px;font-family:Arial,sans-serif;position:relative;z-index:1;border-bottom:4px solid #168b35;">
          <div style="font-size:10px;font-weight:700;line-height:1.55;color:#17324d;text-align:left;">
            <div style="font-size:12px;font-weight:900;color:#168b35;margin-bottom:3px;">${settings.org_name_so}</div>
            Nootaayada & Maamulka Dhulka<br/>
            Diiwaangelinta Sahanka Rasmiga ah
          </div>
          <div style="text-align:center;display:flex;align-items:center;justify-content:center;">
            <img src="/icon.png" alt="Marwaaz logo" style="width:88px;height:88px;object-fit:contain;display:block;" />
          </div>
          <div style="font-size:10px;font-weight:700;line-height:1.55;color:#17324d;text-align:right;">
            <div style="font-size:12px;font-weight:900;color:#2f86c7;margin-bottom:3px;">${settings.org_name_en}</div>
            Notary & Land Administration<br/>
            Official Survey Registration
          </div>
        </div>
      `;

      const footerHTML = (page: number, title: string) => `
        <div style="border-top:1px solid #cbd5e1;padding-top:9px;margin-top:auto;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;font-size:9px;color:#475569;line-height:1.45;font-family:Arial,sans-serif;position:relative;z-index:1;">
          <div style="text-align:left;">${settings.contact_phone || ''}<br/>${settings.contact_email || ''}</div>
          <div style="text-align:center;font-weight:800;color:#17324d;">${title}<br/><span style="color:#168b35;">Bogga ${page} / 2</span></div>
          <div style="text-align:right;">${settings.contact_address || ''}<br/>Generated by Marwaazpn App</div>
        </div>
      `;

      // Host is the one allowed to use out-of-flow positioning (keeps it off-screen).
      // printContainer itself must stay position:static — html2pdf.js clones it and
      // re-parents the clone into its own height:auto wrapper; a fixed/absolute
      // printContainer would be pulled out of flow there and capture as zero-height.
      offscreenHost = document.createElement('div');
      offscreenHost.style.position = 'fixed';
      offscreenHost.style.top = '0px';
      offscreenHost.style.left = '-10000px';
      offscreenHost.style.zIndex = '-1';
      offscreenHost.style.pointerEvents = 'none';

      printContainer = document.createElement('div');
      printContainer.className = 'bg-white text-slate-950 font-sans';
      printContainer.style.width = '750px';
      printContainer.style.backgroundColor = '#ffffff';

      printContainer.innerHTML = `
        <!-- Page 1: Official Land Survey Form -->
        <div class="survey-pdf-page" style="width:750px;height:1060px;padding:32px 38px 28px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#000000;position:relative;overflow:hidden;">
          ${watermarkHTML}
          <div style="position:relative;z-index:1;">
            ${headerHTML}
            
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;margin:14px 0 12px;color:#17324d;">
              <span style="background:#eaf7ee;border:1px solid #b8e1c2;border-radius:999px;padding:6px 12px;">Survey No: ${record.survey_no || record.serial_no}</span>
              <span style="background:#edf6fc;border:1px solid #beddf1;border-radius:999px;padding:6px 12px;">Taariikh: ${issueDate}</span>
            </div>

            <div style="text-align:center;margin:10px 0 16px;">
              <h2 style="font-size:18px;font-weight:900;margin:0;color:#17324d;letter-spacing:0.3px;">FOOMKA SAHANKA DHULKA</h2>
              <div style="font-size:10px;font-weight:800;color:#2f86c7;margin-top:4px;letter-spacing:1.4px;">OFFICIAL LAND SURVEY REPORT</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;color:#17324d;margin-bottom:18px;">
              <div style="grid-column:1 / -1;border-left:4px solid #168b35;background:#f5faf6;padding:9px 12px;border-radius:4px;"><span style="font-size:8px;text-transform:uppercase;color:#64748b;font-weight:800;">Milkiilaha / Owner</span><br/><strong style="font-size:13px;">${record.owner_name}</strong></div>
              <div style="border:1px solid #dce7ef;padding:8px 10px;border-radius:6px;background:#ffffff;"><span style="font-size:8px;color:#64748b;font-weight:800;">GOOBTA</span><br/><strong>${record.neighborhood}${record.branch ? ' - ' + record.branch : ''}</strong></div>
              <div style="border:1px solid #dce7ef;padding:8px 10px;border-radius:6px;background:#ffffff;"><span style="font-size:8px;color:#64748b;font-weight:800;">NOOCA DHULKA</span><br/><strong>${record.land_type || '-'}</strong></div>
              <div style="border:1px solid #dce7ef;padding:8px 10px;border-radius:6px;background:#ffffff;"><span style="font-size:8px;color:#64748b;font-weight:800;">GPS LATITUDE</span><br/><strong>${latVal}</strong></div>
              <div style="border:1px solid #dce7ef;padding:8px 10px;border-radius:6px;background:#ffffff;"><span style="font-size:8px;color:#64748b;font-weight:800;">GPS LONGITUDE</span><br/><strong>${lngVal}</strong></div>
              <div style="grid-column:1 / -1;border:1px solid #b8d8ee;padding:8px 10px;border-radius:6px;background:#edf7fd;text-align:left;"><span style="font-size:8px;color:#64748b;font-weight:800;">BEDKA GUUD / TOTAL AREA</span><br/><strong style="font-size:14px;color:#168b35;">${areaClean} m²</strong></div>
            </div>

            <!-- Table 1: PLOT MEASUREMENTS -->
            <div style="margin-bottom:24px;">
              <h3 style="text-align:left;font-size:11px;font-weight:900;margin:0 0 8px;color:#17324d;">1. CABIRRADA DHULKA / PLOT MEASUREMENTS</h3>
              <table style="width:100%;border-collapse:collapse;border:1px solid #bfd2df;font-size:11px;">
                <thead>
                  <tr style="background:#17324d;color:#ffffff;">
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:left;vertical-align:middle;width:40%;font-weight:bold;">Side</th>
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:left;vertical-align:middle;width:60%;font-weight:bold;">Length (m)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">North</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${cleanVal(record.boundary_w_val)}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">East</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${cleanVal(record.boundary_b_val)}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">West</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${cleanVal(record.boundary_g_val)}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">South</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${cleanVal(record.boundary_k_val)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Table 2: NEIGHBOURING DIRECTIONS -->
            <div style="margin-bottom:20px;">
              <h3 style="text-align:left;font-size:11px;font-weight:900;margin:0 0 8px;color:#17324d;">2. XUDUUDA DERISKA / NEIGHBOURING DIRECTIONS</h3>
              <table style="width:100%;border-collapse:collapse;border:1px solid #bfd2df;font-size:11px;">
                <thead>
                  <tr style="background:#168b35;color:#ffffff;">
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:left;vertical-align:middle;width:40%;font-weight:bold;">Direction</th>
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:left;vertical-align:middle;width:60%;font-weight:bold;">What is next to the land?</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">North</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${record.boundary_w_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">East</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${record.boundary_b_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">West</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${record.boundary_g_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">South</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:left;vertical-align:middle;">${record.boundary_k_neighbor || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          ${footerHTML(1, 'Survey Summary')}
        </div>
        <div class="html2pdf__page-break" style="page-break-after: always; height: 0;"></div>

        <!-- Page 2: Technical Sketch and Satellite Location -->
        <div class="survey-pdf-page" style="width:750px;height:1060px;padding:32px 38px 28px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#000000;position:relative;overflow:hidden;">
          ${watermarkHTML}
          <div style="position:relative;z-index:1;">
            ${headerHTML}
            <div style="display:flex;justify-content:space-between;align-items:center;background:#f5f8fa;border:1px solid #dbe6ed;border-radius:6px;padding:8px 11px;margin:12px 0 12px;font-size:9px;color:#64748b;">
              <span>Survey: <strong style="color:#17324d;">${record.survey_no || record.serial_no}</strong></span>
              <span>Area: <strong style="color:#168b35;">${areaClean} m²</strong></span>
              <span>GPS: <strong style="color:#17324d;">${latVal}, ${lngVal}</strong></span>
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:12px;align-items:stretch;">
              <div style="border:1px solid #b9cbd7;border-left:5px solid #2f86c7;border-radius:7px;padding:10px;background:#ffffff;box-sizing:border-box;height:292px;display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:stretch;">
                <div style="border-right:1px solid #dbe6ed;padding:12px 12px 12px 2px;display:flex;flex-direction:column;justify-content:center;">
                  <h2 style="font-size:14px;font-weight:900;color:#17324d;margin:0;">SAWIRKA FARSAMADA</h2>
                  <div style="font-size:8px;font-weight:800;color:#2f86c7;letter-spacing:0.8px;line-height:1.5;margin-top:5px;">TECHNICAL PARCEL SKETCH</div>
                  <div style="font-size:8px;color:#64748b;line-height:1.5;margin-top:14px;">Cabbirrada iyo xuduudaha rasmiga ah ee dhulka.</div>
                </div>
                <div style="min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#ffffff;">
                  ${sketchImage ? `<img src="${sketchImage}" style="width:100%;height:268px;object-fit:contain;display:block;background:#ffffff;" />` : `<div style="color:#64748b;font-size:11px;">Sketch image not available</div>`}
                </div>
              </div>
              <div style="border:1px solid #b9cbd7;border-left:5px solid #168b35;border-radius:7px;padding:10px;background:#ffffff;box-sizing:border-box;height:292px;display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:stretch;">
                <div style="border-right:1px solid #dbe6ed;padding:12px 12px 12px 2px;display:flex;flex-direction:column;justify-content:center;">
                  <h2 style="font-size:14px;font-weight:900;color:#17324d;margin:0;">GOOBTA DAYAX-GACMEEDKA</h2>
                  <div style="font-size:8px;font-weight:800;color:#168b35;letter-spacing:0.8px;line-height:1.5;margin-top:5px;">SATELLITE LOCATION MAP</div>
                  <div style="font-size:8px;color:#64748b;line-height:1.5;margin-top:14px;">Muuqaalka goobta iyo calaamadda xadka dhulka.</div>
                </div>
                <div style="min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#e2e8f0;">
                  ${satImage ? `<img src="${satImage}" style="width:100%;height:268px;object-fit:cover;display:block;background:#e2e8f0;" />` : `<div style="color:#64748b;font-size:11px;">Satellite map image not available</div>`}
                </div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;font-size:9px;color:#475569;margin-top:10px;">
              <div>Surveyor: ______________________________</div><div style="text-align:right;">Signature: ______________________________</div>
            </div>
          </div>

          ${footerHTML(2, 'Sketch & Satellite Location')}
        </div>
      `;

      // The supplied Word/PDF template is the visual authority for this export.
      const classicHeader = (includeSomaliTitle: boolean) => `
        <div style="display:grid;grid-template-columns:1fr 104px 1fr;align-items:center;height:90px;font-family:Arial,sans-serif;">
          <div style="text-align:center;font-weight:800;line-height:1.25;white-space:nowrap;">
            <div style="font-size:14px;color:#0865ed;">Federal Republic of Somalia</div>
            <div style="font-size:14px;color:#c40000;">Marwaaz Public Notary</div>
            <div style="font-size:12px;color:#1f2937;">Baidoa, Somalia</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;">
            <img src="/icon.png" alt="Marwaaz Public Notary" style="width:82px;height:82px;object-fit:contain;display:block;" />
          </div>
          <div style="text-align:center;font-weight:800;line-height:1.25;white-space:nowrap;direction:rtl;">
            <div style="font-size:14px;color:#0865ed;">جمهورية الصومال الفيدرالية</div>
            <div style="font-size:14px;color:#c40000;">كاتب العدل مرواز</div>
            <div style="font-size:12px;color:#1f2937;">بيدوا، الصومال</div>
          </div>
        </div>
        ${includeSomaliTitle ? `<div style="text-align:center;font-weight:800;line-height:1.15;margin:1px 0 8px;"><div style="font-size:14px;color:#0865ed;">Jamhuuriyadda Federaalka Soomaaliya</div><div style="font-size:14px;color:#c40000;">Nootaayo Marwaaz</div></div>` : ''}
        <div style="height:3px;background:#0b2f63;margin-bottom:10px;"></div>`;
      const contactLine = `<div style="border-top:1.5px solid #111827;margin:7px 18px 0;padding-top:6px;text-align:center;font-size:11px;line-height:1.2;white-space:nowrap;">Tel: +252 61 7 41 41 41 / +252 61 5 92 96 94 Email: <span style="color:#0000ee;text-decoration:underline;">info@marwaazpn.com | marwaaznotary@gmail.com</span></div>`;
      const sideRows = [
        ['Waqooyi / North', cleanVal(record.boundary_w_val), record.boundary_w_neighbor || '-'],
        ['Bari / East', cleanVal(record.boundary_b_val), record.boundary_b_neighbor || '-'],
        ['Galbeed / West', cleanVal(record.boundary_g_val), record.boundary_g_neighbor || '-'],
        ['Koonfur / South', cleanVal(record.boundary_k_val), record.boundary_k_neighbor || '-'],
      ].map(([side, length, neighbour]) => `<tr><td style="font-weight:700;">${side}</td><td>${length}m</td><td>${neighbour}</td></tr>`).join('');

      printContainer.innerHTML = `
        <div class="survey-pdf-page" style="width:750px;height:1060px;padding:24px 42px 20px;box-sizing:border-box;display:flex;flex-direction:column;font:12px/1.15 Arial,sans-serif;background:#fff;color:#000;position:relative;overflow:hidden;">
          <div style="position:absolute;left:205px;top:350px;width:330px;height:330px;opacity:.06;"><img src="/icon.png" style="width:100%;height:100%;object-fit:contain;" /></div>
          <div style="position:relative;z-index:1;">${classicHeader(true)}
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;padding:0 5px 6px;"><span>Sumad No: ${record.survey_no || record.serial_no}</span><span>Taariikh: ${issueDate}</span></div>
            <div style="font-size:14px;font-weight:800;text-align:center;margin:0 0 6px;">WARBIXINTA RASMIGA AH EE DHULKA</div>
            <table class="classic-survey-table" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;margin-bottom:11px;">
              <tr><th>Milkiilaha / Owner</th><th>Goobta (Location):</th></tr>
              <tr><td>${record.owner_name}</td><td>${record.neighborhood}${record.branch ? ' - ' + record.branch : ''}</td></tr>
              <tr><th>GPS Coordinates</th><th>Cabirka Guud / Total Area</th></tr>
              <tr><td>Latitude: ${latVal} Longitude: ${lngVal}</td><td>${areaClean} m²</td></tr>
            </table>
            <div style="font-size:14px;font-weight:800;line-height:1.15;margin:0 4px 8px;white-space:normal;text-align:center;">Cabirka Iyo Soohdimaha Dhulka /Plot Measurements &amp; Neighboring Directions</div>
            <table class="classic-survey-table measurement-table" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px;margin-bottom:10px;">
              <tr><th style="width:24%;">Jihada / Side</th><th style="width:29%;">Cabirka / Length (M)</th><th style="width:47%;">Deriska / Neighbour</th></tr>
              ${sideRows}
            </table>
            <div style="font-size:14px;font-weight:800;margin:0 4px 8px;">Jaantuska Cabbirka iyo Bedka Dhulka</div>
            <div style="height:400px;border:1px solid #1683df;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${sketchImage ? `<img src="${sketchImage}" style="width:100%;height:100%;object-fit:contain;display:block;" />` : ''}
            </div>
          </div>
          <div style="margin-top:auto;position:relative;z-index:1;">${contactLine}</div>
        </div>
        <div class="html2pdf__page-break" style="page-break-after:always;height:0;"></div>
        <div class="survey-pdf-page" style="width:750px;height:1060px;padding:20px 46px 20px;box-sizing:border-box;display:flex;flex-direction:column;font:14px/1.2 Arial,sans-serif;background:#fff;color:#000;overflow:hidden;">
          <div>${classicHeader(true)}</div>
          <div style="height:46px;border:1.5px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-size:14px;font-weight:800;margin:8px 0 14px;padding:0 10px;box-sizing:border-box;">GPS Ir Latitude&nbsp; <span style="color:#0000ee;">(${latVal}, ${lngVal})</span>&nbsp; Longitude</div>
          <div style="height:695px;border:1px solid #1683df;background:#e2e8f0;overflow:hidden;">
            ${satImage ? `<img src="${satImage}" style="width:100%;height:100%;display:block;" />` : ''}
          </div>
          <div style="margin-top:auto;">${contactLine}</div>
        </div>
        <style>
          .classic-survey-table th{background:#0b79bd;color:#fff;text-align:left;font:800 15px/1.15 Arial,sans-serif;padding:8px 12px;border:1px solid #b4c7d3;white-space:normal;overflow-wrap:anywhere;vertical-align:middle;box-sizing:border-box;}
          .classic-survey-table td{text-align:left;font:400 14px/1.15 Arial,sans-serif;padding:8px 12px;border:1px solid #b4c7d3;white-space:normal;overflow-wrap:anywhere;vertical-align:middle;box-sizing:border-box;}
          .classic-survey-table tbody tr:nth-child(even) td{background:#e7f3f7;}
        </style>`;

      offscreenHost.appendChild(printContainer);
      document.body.appendChild(offscreenHost);

      const images = Array.from(printContainer.querySelectorAll('img'));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 300));

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pages = Array.from(printContainer.querySelectorAll('.survey-pdf-page')) as HTMLElement[];
      for (let index = 0; index < pages.length; index += 1) {
        const pageCanvas = await html2canvas(pages[index], {
          width: 750,
          height: 1060,
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        });
        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      const fileName = `Survey_Report_SN_${record.serial_no}_${record.owner_name.replace(/\s+/g, '_')}.pdf`;
      const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;

      if (isMobileDevice) {
        const pdfBlob = pdf.output('blob');
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
        const shareData: ShareData = { files: [pdfFile], title: fileName };

        if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(shareData))) {
          await navigator.share(shareData);
          showAlert('Guul', 'PDF-ka waa la diyaariyey. Ka dooro Save ama app-ka aad rabto.', 'success');
        } else {
          const blobUrl = URL.createObjectURL(pdfBlob);
          const downloadLink = document.createElement('a');
          downloadLink.href = blobUrl;
          downloadLink.download = fileName;
          downloadLink.rel = 'noopener';
          document.body.appendChild(downloadLink);
          downloadLink.click();
          downloadLink.remove();
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
          showAlert('Guul', 'PDF-ka waa la soo dejiyay.', 'success');
        }
      } else {
        pdf.save(fileName);
        showAlert('Guul', 'PDF-ka waa la soo dejiyay.', 'success');
      }

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Error generating PDF:', err);
      showAlert('Cillad', 'Ma suuragalin in PDF-ka la soo dejiyo.', 'error');
    } finally {
      if (offscreenHost && offscreenHost.parentNode) {
        offscreenHost.parentNode.removeChild(offscreenHost);
      }
      if (styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-center justify-center md:p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full h-full md:h-auto md:max-w-6xl bg-white border-0 md:border md:border-slate-100 md:rounded-3xl overflow-hidden shadow-2xl flex flex-col my-0 md:my-8 animate-in fade-in md:zoom-in-95 duration-200 text-slate-800">
        
        {/* Modal Header */}
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-teal-50 text-teal-600 p-2 rounded-xl border border-teal-100 shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm text-slate-800 truncate">Warbixinta Sahanka Dhulka</h3>
              <p className="text-xs text-slate-500 font-semibold truncate">Record details and spatial parameters</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setShowRefPanel((prev) => !prev)}
              className={`relative flex items-center gap-1.5 text-xs font-bold py-2 md:py-2.5 px-3 md:px-4 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 shrink-0 ${
                showRefPanel ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Hash className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">REF NUMBERS</span>
              <span className="sm:hidden">REF</span>
              {linkedRefs.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">
                  {linkedRefs.length}
                </span>
              )}
            </button>
            <button
              onClick={handlePrintPDF}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2 md:py-2.5 px-3 md:px-4 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
            >
              <Download className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">SOO DEJI PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-800 p-1.5 md:p-2 rounded-xl hover:bg-slate-105 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 md:p-5 overflow-y-auto flex-1 md:max-h-[calc(90vh-80px)]" id="survey-report-print">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left Column: Text Data */}
            <div className="space-y-4">
              
              {/* Top stats metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="block text-xs font-black uppercase tracking-wider text-slate-400">SERIAL NO.</span>
                    <Clock className="hidden h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mt-auto">
                    <Hash className="h-4 w-4 text-teal-600" />
                    <span>{record.survey_no || record.serial_no}</span>
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="block text-xs font-black uppercase tracking-wider text-slate-400">TAARIIKHDA DIWAANKA</span>
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mt-auto">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span>{record.created_at ? new Date(record.created_at).toLocaleDateString('so-SO') : '-'}</span>
                  </div>
                </div>
              </div>

              {/* Owner Info */}
              <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-0.5">MILKILAHA DHULKA</span>
                  <div className="text-sm font-bold text-slate-800">{record.owner_name}</div>
                </div>
              </div>

              {/* Neighborhood / Branch info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
                    <MapPin className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-0.5">XAAFADDA (NEIGHBORHOOD)</span>
                    <div className="text-sm font-bold text-slate-800">{record.neighborhood}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
                    <Home className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-0.5">LAANTA (BRANCH)</span>
                    <div className="text-sm font-bold text-slate-800">{record.branch}</div>
                  </div>
                </div>
              </div>

              {/* Vicinity */}
              {record.vicinity && (
                <div className="p-3.5 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                  <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">NAWAAXIGA (Vicinity)</span>
                  <div className="text-sm font-bold text-slate-800">{record.vicinity}</div>
                </div>
              )}

              {/* Boundaries Section */}
              <div className="space-y-2">
                <span className="block text-xs font-black uppercase tracking-wider text-slate-400">SOOHDIMAHA DHULKA (BOUNDARIES)</span>
                
                {/* Desktop/Tablet Table View */}
                <div className="hidden sm:block border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-200/80 text-slate-500 font-bold text-xs">
                        <th className="px-4 py-2">Jihada</th>
                        <th className="px-4 py-2 text-center">Cabirka (m)</th>
                        <th className="px-4 py-2">Deriska (Neighbor)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {boundaries.length > 0 ? (
                        boundaries.map((boundary, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                            <td className="px-4 py-2 font-bold text-teal-600 flex items-center gap-2">
                              <Compass className="h-4 w-4 text-teal-600/70" />
                              <span>{boundary?.jihadaName}</span>
                            </td>
                            <td className="px-4 py-2 text-center font-bold text-slate-800">{boundary?.cabirka}</td>
                            <td className="px-4 py-2 text-slate-500 font-medium">{boundary?.deriska}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-slate-400 font-semibold italic">
                            Soohdimaha lama hayo
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile List View */}
                <div className="sm:hidden flex flex-col gap-2">
                  {boundaries.length > 0 ? (
                    boundaries.map((boundary, idx) => (
                      <div 
                        key={idx} 
                        className="p-3.5 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-sm text-teal-600 flex items-center gap-1.5">
                            <Compass className="h-3.5 w-3.5 text-teal-600/70" />
                            {boundary?.jihadaName}
                          </span>
                          <span className="bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-lg text-xs font-black text-slate-700">
                            Cabirka: {boundary?.cabirka}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs uppercase font-extrabold text-slate-400 block">Deriska (Neighbor)</span>
                          <span className="text-sm font-bold text-slate-800">{boundary?.deriska || '-'}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-slate-400 font-semibold italic bg-white border border-slate-200/60 rounded-2xl">
                      Soohdimaha lama hayo
                    </div>
                  )}
                </div>
              </div>

              {/* Land Type & Built Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
                    <Layers className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-0.5">NOOCA DHULKA</span>
                    <div className="text-sm font-bold text-slate-800">{record.land_type}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
                    <Compass className="h-4.5 w-4.5 text-teal-600" />
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-0.5">GPS COORDINATES</span>
                    <code className="text-sm font-bold text-teal-600 block select-all truncate">{record.gps_location || 'N/A'}</code>
                  </div>
                </div>
              </div>

              {/* Waxa ku dhisan (Built details) */}
              {record.built_details && (
                <div className="p-3 border border-rose-100 rounded-2xl bg-rose-50/50">
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-rose-600 mb-1">WAXA KU DHISAN</span>
                  <div className="text-sm font-bold text-slate-800">{record.built_details}</div>
                </div>
              )}
            </div>
             {/* Right Column: Interactive Maps */}
            <div className="space-y-4">
              
              {/* Satellite Map */}
              {isSatFullscreen && (
                <div 
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" 
                  onClick={() => setIsSatFullscreen(false)} 
                />
              )}
              <div className={isSatFullscreen ? "fixed inset-4 md:inset-10 z-50 bg-white shadow-2xl flex flex-col rounded-3xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200" : "border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm"}>
                <div className="bg-slate-50/50 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-black tracking-wider text-slate-700 uppercase flex items-center gap-2">
                    <Layers className="h-4 w-4 text-teal-600" />
                    <span>MAP EXPLORER SATELLITE VIEW</span>
                  </span>
                  <button 
                    onClick={() => setIsSatFullscreen(!isSatFullscreen)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer border border-slate-200 bg-white shadow-sm"
                  >
                    {isSatFullscreen ? (
                      <>
                        <Minimize2 className="h-3.5 w-3.5" />
                        <span>KAYDSO (MINIMIZE)</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="h-3.5 w-3.5" />
                        <span>FULL SCREEN</span>
                      </>
                    )}
                  </button>
                </div>
                <div ref={satelliteMapContainerRef} style={isSatFullscreen ? { height: '100%', flex: 1 } : { height: '320px' }} className="w-full z-0" />
              </div>

              {/* Technical Sketch Canvas */}
              {isSketchFullscreen && (
                <div 
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" 
                  onClick={() => setIsSketchFullscreen(false)} 
                />
              )}
              <div className={isSketchFullscreen ? "fixed inset-4 md:inset-10 z-50 bg-white shadow-2xl flex flex-col rounded-3xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200" : "border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm"}>
                <div className="bg-slate-50/50 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-black tracking-wider text-slate-700 uppercase flex items-center gap-2">
                    <Layers className="h-4 w-4 text-slate-700" />
                    <span>TECHNICAL SKETCH CANVAS</span>
                  </span>
                  <button 
                    onClick={() => setIsSketchFullscreen(!isSketchFullscreen)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer border border-slate-200 bg-white shadow-sm"
                  >
                    {isSketchFullscreen ? (
                      <>
                        <Minimize2 className="h-3.5 w-3.5" />
                        <span>KAYDSO (MINIMIZE)</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="h-3.5 w-3.5" />
                        <span>FULL SCREEN</span>
                      </>
                    )}
                  </button>
                </div>
                <div
                  ref={sketchMapContainerRef}
                  style={isSketchFullscreen ? { height: '100%', flex: 1, backgroundColor: '#ffffff' } : { height: '320px', backgroundColor: '#ffffff' }}
                  className="details-sketch-map w-full z-0 bg-white"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Mobile: the ref panel covers the full card width there, so tapping anywhere
            outside it (not just its own close button) should dismiss it. */}
        {showRefPanel && (
          <button
            type="button"
            onClick={() => setShowRefPanel(false)}
            aria-label="Xir Ref Numbers"
            className="absolute inset-0 z-10 bg-slate-900/30 backdrop-blur-[1px] md:hidden"
          />
        )}

        {/* Reference-numbers side panel: every Nootaayo reference (Document Archive
            entry) issued against this specific land parcel, linked via
            references.survey_id. Slides in from the right instead of taking permanent
            space, since most records will have few or none. */}
        <div
          className={`absolute inset-y-0 right-0 z-20 flex w-full max-w-xs flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${
            showRefPanel ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-white">
                <Hash className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-black text-slate-800">Ref Numbers</p>
                <p className="text-[10px] font-semibold text-slate-500">Dhulkan lagu isticmaalay</p>
              </div>
            </div>
            <button
              onClick={() => setShowRefPanel(false)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Xir"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {linkedRefsLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs font-semibold text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Sug fadlan...
              </div>
            ) : linkedRefs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Hash className="h-6 w-6 text-slate-300" />
                <p className="text-xs font-semibold text-slate-400">Weli ma jiro ref number dhulkan lagu isticmaalay.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {linkedRefs.map((ref) => (
                  <div key={ref.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-black text-slate-900">{ref.ref_number}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${
                        ref.status === 'Completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : ref.status === 'Picked Up' ? 'border-violet-200 bg-violet-50 text-violet-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}>
                        {ref.status}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-slate-600">{ref.subject}</p>
                    <p className="mt-1 text-[10px] font-medium text-slate-400">
                      {ref.issue_date ? new Date(ref.issue_date).toLocaleDateString('so-SO') : (ref.created_at ? new Date(ref.created_at).toLocaleDateString('so-SO') : '-')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab handle to reopen the panel once closed, so it's discoverable without
            re-reading the header button. */}
        {!showRefPanel && (
          <button
            onClick={() => setShowRefPanel(true)}
            className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-l-xl border border-r-0 border-slate-200 bg-white px-1.5 py-3 text-slate-500 shadow-md hover:bg-slate-50 hover:text-slate-800"
            aria-label="Fur Ref Numbers"
            title="Ref Numbers"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

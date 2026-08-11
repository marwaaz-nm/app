'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Survey } from '@/types';
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
  Minimize2
} from 'lucide-react';
import L from 'leaflet';
import { useModal } from '@/context/ModalContext';
import { useSettings } from '@/context/SettingsContext';
import { buildDirectionLabel, getDirectionFromCenter, type BoundaryInfo } from '@/lib/geoDirection';

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
  const addSketchDimension = (start: L.LatLng, end: L.LatLng, map: L.Map, allCoords: L.LatLng[]) => {
    const dist = map.distance(start, end).toFixed(1);

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
               <span class="dist-text">${parseFloat(dist).toFixed(3)}</span>
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
  const addBoundaryDirectionLabel = (
    start: L.LatLng,
    end: L.LatLng,
    map: L.Map,
    allCoords: L.LatLng[],
    center: { lat: number; lng: number },
    boundaryInfo: BoundaryInfo,
  ) => {
    const mid = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);
    const direction = getDirectionFromCenter(center.lat, center.lng, mid.lat, mid.lng);
    const label = buildDirectionLabel(direction, boundaryInfo[direction]);

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

    L.marker(L.latLng(mid.lat + oy, mid.lng + ox), {
      icon: L.divIcon({
        className: 'boundary-direction-label',
        html: `<div class="boundary-direction-box">${label}</div>`,
        iconSize: [150, 36],
        iconAnchor: [75, 18],
      }),
    }).addTo(map);
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
          dragging: !L.Browser.mobile,
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

        for (let i = 0; i < latlngs.length; i++) {
          if (!mainBoundaryIndices.has(i)) continue;
          const start = latlngs[i];
          const end = latlngs[(i + 1) % latlngs.length];
          addBoundaryDirectionLabel(start, end, satMap, latlngs, vertexCenter, boundaryInfo);
        }

        L.control.zoom({ position: 'bottomright' }).addTo(satMap);

        // Single-finger dragging is intentionally off on mobile (so the modal can still
        // be scrolled by swiping over the map) — but Leaflet ties its CSS touch-action
        // to whichever handlers are enabled, and with dragging off it only ever applies
        // `touch-action: pan-x pan-y` (no pinch-zoom keyword), which makes the browser
        // suppress the two-finger pinch gesture before Leaflet's own TouchZoom handler
        // ever sees it. Overriding the inline style (which wins over the class rule)
        // restores pinch while still blocking single-finger pan.
        satMap.getContainer().style.touchAction = 'pan-y pinch-zoom';

        satelliteMapRef.current = satMap;
        satelliteMapContainerRef.current.addEventListener('wheel', handleSatWheel, { passive: false });
      }

      // --- TECHNICAL SKETCH MAP INITIALIZATION ---
      if (sketchMapContainerRef.current) {
        const skMap = L.map(sketchMapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: !L.Browser.mobile,
          touchZoom: true,
          scrollWheelZoom: false, // Use our custom wheel handler instead
          preferCanvas: true,
        });
        skMap.getContainer().style.backgroundColor = '#ffffff';
        // See the matching comment on the satellite map above — this override is what
        // actually lets pinch-zoom work on mobile despite single-finger drag being off.
        skMap.getContainer().style.touchAction = 'pan-y pinch-zoom';

        L.polygon(coords, {
          color: '#090d16',
          weight: 3,
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(skMap);

        const center = bounds.getCenter();

        // Add dimensions to each line segment (all sides get a length; only the 4 main
        // boundaries additionally get a Waqooyi/Bari/Koonfur/Galbeed direction label).
        for (let i = 0; i < latlngs.length; i++) {
          const start = latlngs[i];
          const end = latlngs[(i + 1) % latlngs.length];
          addSketchDimension(start, end, skMap, latlngs);
          if (mainBoundaryIndices.has(i)) {
            addBoundaryDirectionLabel(start, end, skMap, latlngs, vertexCenter, boundaryInfo);
          }
        }

        // Add Center Area Label
        const matchArea = record.sketch_dimensions?.match(/Area:\s*([^\s|]+)/i) || record.sketch_dimensions?.match(/Area\s*([^\s|]+)/i);
        const areaValue = matchArea ? matchArea[1] + ' m²' : 'N/A';

        L.marker(center, {
          icon: L.divIcon({
            className: 'sketch-area-label',
            html: `
              <div class="modal-area-box font-sans">
                <small style="display: block; font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: -2px;">Area</small>
                <strong>${areaValue}</strong>
              </div>`,
            iconSize: [110, 50],
            iconAnchor: [55, 25]
          })
        }).addTo(skMap);

        skMap.fitBounds(bounds, { padding: [20, 20] });
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
      .leaflet-overlay-pane svg path {
        stroke: #000000 !important;
      }
    `;

    let printContainer: HTMLDivElement | null = null;
    let offscreenHost: HTMLDivElement | null = null;

    try {
      document.head.appendChild(styleEl);
      showAlert('Sug fadlan...', 'PDF-ka ayaa la diyaarinayaa, fadlan sug...', 'info');

      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
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
          container.style.height = '604px';
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
          // Target ratio matches the Page 3 image box: ~655px wide x 550px tall.
          const satCropped = cropCanvasToAspect(satCanvas, 655 / 550);
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
        const restoreSketch = prepareMapForCapture(sketchMapContainerRef.current);

        const areaBox = sketchMapContainerRef.current.querySelector('.modal-area-box') as HTMLElement;
        const originalAreaHTML = areaBox ? areaBox.innerHTML : '';
        if (areaBox) {
          const strongEl = areaBox.querySelector('strong');
          const areaNum = strongEl ? strongEl.innerText.replace(' m²', '').replace('m²', '').trim() : '';
          areaBox.innerHTML = `<div style="line-height: 1.3;">Area =<br/>${areaNum}</div>`;
        }

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
                color: '#000000',
                weight: 4.0,
                fillColor: '#ffffff',
                fillOpacity: 1.0,
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
          sketchImage = sketchCanvas.toDataURL('image/jpeg', 0.95);
        } catch (e) {
          console.error('Failed to capture sketch map', e);
        } finally {
          originalStyles.forEach((style, layer) => {
            layer.setStyle(style);
          });
          if (areaBox) {
            areaBox.innerHTML = originalAreaHTML;
          }
          restoreSketch();
        }
      }

      const options = {
        margin: [0, 0, 0, 0] as [number, number, number, number],
        filename: `Survey_Report_SN_${record.serial_no}_${record.owner_name.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          letterRendering: true,
          backgroundColor: '#ffffff',
          logging: false
        },
        pagebreak: { mode: ['css', 'legacy'], after: '.html2pdf__page-break' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      const gpsParts = record.gps_location ? record.gps_location.split(',') : [];
      const latVal = gpsParts[0] ? gpsParts[0].trim() : 'N/A';
      const lngVal = gpsParts[1] ? gpsParts[1].trim() : 'N/A';
      const areaClean = record.sketch_area ? record.sketch_area.replace(' m²', '').replace('m²', '').trim() : 'N/A';
      const issueDate = record.created_at ? new Date(record.created_at).toLocaleDateString('en-GB') : '-';

      const cleanVal = (val: string | undefined) => {
        if (!val) return '-';
        return val.replace('m', '').replace('M', '').trim();
      };

      // Official Baidoa Emblem Seal SVG for Header & Background Watermark
      const emblemSealSVG = `
        <svg width="72" height="72" viewBox="0 0 100 100" style="display:block;margin:0 auto 4px;">
          <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#166534" stroke-width="4"/>
          <circle cx="50" cy="50" r="39" fill="none" stroke="#22c55e" stroke-width="1" stroke-dasharray="2,2"/>
          <path id="curve-top" d="M 12,50 A 38,38 0 0,1 88,50" fill="none"/>
          <text font-size="4.2" font-weight="900" fill="#15803d" letter-spacing="0.2">
            <textPath href="#curve-top" startOffset="50%" text-anchor="middle">DOWLADDA HOOSE DEGMADA BAYDHABO</textPath>
          </text>
          <path id="curve-bottom" d="M 88,50 A 38,38 0 0,1 12,50" fill="none"/>
          <text font-size="4" font-weight="900" fill="#15803d" letter-spacing="0.2">
            <textPath href="#curve-bottom" startOffset="50%" text-anchor="middle">LOCAL GOVERNMENT BAIDOA DISTRICT</textPath>
          </text>
          <path d="M 36,36 A 14,14 0 0,0 64,36 C 64,54 50,68 50,68 C 50,68 36,54 36,36 Z" fill="#2563eb" stroke="#1d4ed8" stroke-width="1.5"/>
          <polygon points="50,38 52.5,44.5 59.5,45.5 54.2,50 55.5,57 50,53.5 44.5,57 45.8,50 40.5,45.5 47.5,44.5" fill="#ffffff"/>
          <path d="M 28,74 Q 50,82 72,74 L 68,78 Q 50,85 32,78 Z" fill="#b91c1c"/>
          <text x="50" y="79" font-size="3.5" font-weight="bold" fill="#ffffff" text-anchor="middle">BAYDHABO / BAIDOA</text>
        </svg>
      `;

      const watermarkHTML = `
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:360px;height:360px;opacity:0.025;pointer-events:none;z-index:0;">
          <svg width="100%" height="100%" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#166534" stroke-width="3"/>
            <circle cx="50" cy="50" r="39" fill="none" stroke="#22c55e" stroke-width="1" stroke-dasharray="2,2"/>
            <path d="M 36,36 A 14,14 0 0,0 64,36 C 64,54 50,68 50,68 C 50,68 36,54 36,36 Z" fill="#2563eb" stroke="#1d4ed8" stroke-width="1.5"/>
            <polygon points="50,38 52.5,44.5 59.5,45.5 54.2,50 55.5,57 50,53.5 44.5,57 45.8,50 40.5,45.5 47.5,44.5" fill="#ffffff"/>
          </svg>
        </div>
      `;

      const headerHTML = `
        <div style="display:grid;grid-template-columns:1.2fr 1fr 1.2fr;gap:12px;align-items:center;padding:10px 0 8px;font-family:Arial,sans-serif;position:relative;z-index:1;">
          <!-- Left Column: Somali -->
          <div style="font-size:10px;font-weight:700;line-height:1.45;color:#000000;text-align:left;">
            Dowladda Koonfur Galbeed Soomaaliya<br/>
            Dowladda Hoose ee Baydhabo<br/>
            Waaxda Howlaha Guud, Guryeynta<br/>
            Iyo Maamulka Dhulka
          </div>
          
          <!-- Center Column: Seal Emblem & English -->
          <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            ${emblemSealSVG}
            <div style="font-size:8.5px;font-weight:bold;line-height:1.3;color:#000000;text-transform:none;white-space:nowrap;">
              <strong>Southwest State of Somalia</strong><br/>
              Municipality of Baidoa<br/>
              Public works, Housing and land<br/>
              Administration Department
            </div>
          </div>

          <!-- Right Column: Arabic -->
          <div style="font-size: 11px; font-weight: bold; line-height: 1.45; color: #000000; text-align: right; direction: rtl;">
            ولاية جنوب غرب الصومال<br/>
            حكومة بلدية بيدوا<br/>
            إدارة الأشغال العامة والإسكان<br/>
            وإدارة الأراضي
          </div>
        </div>
        <div style="border-bottom:2px solid #000080;margin:10px 0 16px;"></div>
      `;

      const footerHTML = `
        <div style="border-top:1.5px solid #000000;padding-top:10px;margin-top:auto;text-align:center;font-size:11px;color:#000000;line-height:1.6;font-family:Arial,sans-serif;position:relative;z-index:1;">
          <div>Email :<a href="mailto:${settings.contact_email}" style="color:#0000ee;text-decoration:underline;">${settings.contact_email}</a></div>
          <div>Mobile: ${settings.contact_phone}</div>
          <div>${settings.contact_address}</div>
          <div style="margin-top:4px;font-size:9px;color:#475569;">System-ka waxaa maamula ${settings.org_name_so} (${settings.org_name_en})</div>
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
        <div style="width:750px;min-height:1040px;padding:32px 38px 28px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#000000;position:relative;">
          ${watermarkHTML}
          <div style="position:relative;z-index:1;">
            ${headerHTML}
            
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;margin-bottom:20px;color:#000000;">
              <span>Ref No: ${record.serial_no}</span>
              <span>Date: ${issueDate}</span>
            </div>

            <h2 style="text-align:center;font-size:16px;font-weight:bold;margin:18px 0 22px;letter-spacing:0.5px;color:#000000;">OFFICIAL LAND SURVEY FORM</h2>

            <div style="font-size:12px;line-height:2.0;color:#000000;margin-bottom:24px;">
              <div><strong>Plot Location:</strong> ${record.neighborhood}${record.branch ? ' Laanta ' + record.branch : ''}</div>
              <div><strong>Parcel Number:</strong> ${record.serial_no ? 'SRV-' + record.serial_no : 'N/A'}</div>
              <div><strong>Owner's Full Name:</strong> ${record.owner_name}</div>
              <div><strong>Contact Number:</strong> ${(record as unknown as { phone_number?: string }).phone_number || '+252611122205'}</div>
              <div><strong>GPS Coordinates:</strong> Latitude: ${latVal} &nbsp;&nbsp;&nbsp;&nbsp; Longitude: ${lngVal}</div>
              <div><strong>Total Area (Sq.m):</strong> ${areaClean}</div>
            </div>

            <!-- Table 1: PLOT MEASUREMENTS -->
            <div style="margin-bottom:24px;">
              <h3 style="text-align:center;font-size:13px;font-weight:bold;margin:0 0 10px;color:#000000;">1. PLOT MEASUREMENTS</h3>
              <table style="width:100%;border-collapse:collapse;border:1.5px solid #000000;font-size:12px;">
                <thead>
                  <tr style="background:#ffffff;border-bottom:1.5px solid #000000;">
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:center;width:40%;font-weight:bold;">Side</th>
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:center;width:60%;font-weight:bold;">Length (m)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">North</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${cleanVal(record.boundary_w_val)}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">East</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${cleanVal(record.boundary_b_val)}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">West</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${cleanVal(record.boundary_g_val)}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">South</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${cleanVal(record.boundary_k_val)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Table 2: NEIGHBOURING DIRECTIONS -->
            <div style="margin-bottom:20px;">
              <h3 style="text-align:center;font-size:13px;font-weight:bold;margin:0 0 10px;color:#000000;">2. NEIGHBOURING DIRECTIONS</h3>
              <table style="width:100%;border-collapse:collapse;border:1.5px solid #000000;font-size:12px;">
                <thead>
                  <tr style="background:#ffffff;border-bottom:1.5px solid #000000;">
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:center;width:40%;font-weight:bold;">Direction</th>
                    <th style="padding:8px 12px;border:1.5px solid #000000;text-align:center;width:60%;font-weight:bold;">What is next to the land?</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">North</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${record.boundary_w_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">East</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${record.boundary_b_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">West</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${record.boundary_g_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #000000;">
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">South</td>
                    <td style="padding:8px 12px;border:1px solid #000000;text-align:center;">${record.boundary_k_neighbor || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          ${footerHTML}
        </div>
        <div class="html2pdf__page-break" style="page-break-after: always; height: 0;"></div>

        <!-- Page 2: Technical Drawing Sketch -->
        <div style="width:750px;min-height:1040px;padding:32px 38px 28px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#000000;position:relative;">
          ${watermarkHTML}
          <div style="position:relative;z-index:1;">
            ${headerHTML}
            
            <div style="font-size:12px;line-height:1.7;color:#000000;margin:16px 0 14px;">
              <p style="margin-bottom:16px;">This document forms part of the official land registration process and shall be permanently filed with the corresponding parcel records for future reference and legal use.</p>
              
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;font-size:12px;font-weight:bold;">
                <span>Surveyor Name: Eng. Salah Ali Mohamed</span>
                <span>Signature: ________________</span>
              </div>

              <p style="margin-bottom:6px;">A detailed site sketch illustrating the approximate shape of the land parcel including all measured sides and their respective lengths, as well as any adjacent features noted during the survey.</p>
              <p style="font-style:italic;margin-bottom:14px;">This sketch forms part of the official record.</p>
            </div>

            <div style="border:1.5px solid #000000;padding:12px;background:#ffffff;box-sizing:border-box;margin-bottom:16px;display:flex;align-items:center;justify-content:center;height:520px;">
              ${sketchImage ? `<img src="${sketchImage}" style="max-width:100%;max-height:490px;object-fit:contain;background:#ffffff;" />` : `<div style="color:#64748b;font-size:12px;">Sketch image not available</div>`}
            </div>
          </div>

          ${footerHTML}
        </div>
        <div class="html2pdf__page-break" style="page-break-after: always; height: 0;"></div>

        <!-- Page 3: Satellite Location Map -->
        <div style="width:750px;min-height:1040px;padding:32px 38px 28px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#000000;position:relative;">
          <div style="position:relative;z-index:1;">
            ${headerHTML}
            
            <div style="border:1.5px solid #000000;padding:10px 14px;text-align:center;font-size:14px;font-weight:bold;margin:20px 0 16px;color:#000000;">
              GPS Ir Latitude ( <span style="color:#0000ff;">${latVal}</span> &nbsp;&nbsp; <span style="color:#0000ff;">${lngVal}</span> ) Longitude
            </div>

            <div style="border:1.5px solid #000000;padding:8px;background:#ffffff;box-sizing:border-box;margin-bottom:16px;display:flex;align-items:center;justify-content:center;height:570px;">
              ${satImage ? `<img src="${satImage}" style="width:100%;height:550px;display:block;background:#e2e8f0;" />` : `<div style="color:#64748b;font-size:12px;">Satellite map image not available</div>`}
            </div>
          </div>

          ${footerHTML}
        </div>
      `;

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

      await html2pdf().set(options).from(printContainer).save();
      showAlert('Guul', 'PDF-ka waa la soo dejiyay.', 'success');

    } catch (err) {
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center md:p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full h-full md:h-auto md:max-w-6xl bg-white border-0 md:border md:border-slate-100 md:rounded-3xl overflow-hidden shadow-2xl flex flex-col my-0 md:my-8 animate-in fade-in md:zoom-in-95 duration-200 text-slate-800">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center px-4 md:px-6 py-4 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 text-teal-600 p-2 rounded-xl border border-teal-100">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-800">Warbixinta Sahanka Dhulka</h3>
              <p className="text-xs text-slate-500 font-semibold">Record details and spatial parameters</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
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
                    <span>{record.serial_no}</span>
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
      </div>
    </div>,
    document.body
  );
}

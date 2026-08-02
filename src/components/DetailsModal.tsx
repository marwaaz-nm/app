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

interface DetailsModalProps {
  record: Survey | null;
  onClose: () => void;
}

export default function DetailsModal({ record, onClose }: DetailsModalProps) {
  const { showAlert } = useModal();
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
  const addSketchDimension = (start: L.LatLng, end: L.LatLng, map: L.Map, allCoords: L.LatLng[], showDirection = true) => {
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

    const offset = 0.000025; // Offset distance from polygon border
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

    // Position for the direction letter - further outward so they never overlap
    const ly = oy * 1.95;
    const lx = ox * 1.95;
    const letterPos = L.latLng(mid.lat + ly, mid.lng + lx);

    // Draw dimension polyline
    L.polyline([p1, p2], { color: '#3b82f6', weight: 1.5, opacity: 0.8 }).addTo(map);

    // Draw extension lines (CAD style connecting polygon corners to dimension lines)
    L.polyline([start, p1], { color: '#3b82f6', weight: 1, opacity: 0.5 }).addTo(map);
    L.polyline([end, p2], { color: '#3b82f6', weight: 1, opacity: 0.5 }).addTo(map);

    // Calculate direction letter based on segment location relative to polygon center
    let sumLat = 0, sumLng = 0;
    allCoords.forEach(c => {
      sumLat += c.lat;
      sumLng += c.lng;
    });
    const center = { lat: sumLat / allCoords.length, lng: sumLng / allCoords.length };
    const diffLat = mid.lat - center.lat;
    const diffLng = mid.lng - center.lng;

    let dirLetter = '';
    if (Math.abs(diffLng) > Math.abs(diffLat)) {
      dirLetter = diffLng > 0 ? 'E' : 'W';
    } else {
      dirLetter = diffLat > 0 ? 'N' : 'S';
    }

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

    // Create direction letter label (completely unrotated/upright) - only if showDirection is true
    if (showDirection) {
      L.marker(letterPos, {
        icon: L.divIcon({
          className: 'sketch-dir-letter',
          html: `
            <div class="dir-letter-val" style="transform: translate(-50%, -50%); font-family: sans-serif; font-size: 13px; font-weight: bold; color: #000000; text-align: center; display: none;">
                 ${dirLetter}
            </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      }).addTo(map);
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
          preferCanvas: true,
        });

        // Center on the polygon, but zoomed out by exactly 2 levels to show more houses/streets
        const zoomLevel = satMap.getBoundsZoom(bounds) - 2;
        satMap.setView(bounds.getCenter(), zoomLevel);

        satTile.addTo(satMap);

        L.polygon(coords, { 
          color: '#2563eb', // Changed to blue
          weight: 2.5, 
          fillColor: '#3b82f6',
          fillOpacity: 0.15 
        }).addTo(satMap);

        L.control.zoom({ position: 'bottomright' }).addTo(satMap);

        satelliteMapRef.current = satMap;
        satelliteMapContainerRef.current.addEventListener('wheel', handleSatWheel, { passive: false });
      }

      // --- TECHNICAL SKETCH MAP INITIALIZATION ---
      if (sketchMapContainerRef.current) {
        const skMap = L.map(sketchMapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: !L.Browser.mobile,
          scrollWheelZoom: false, // Use our custom wheel handler instead
          preferCanvas: true,
        });
        skMap.getContainer().style.backgroundColor = '#ffffff';

        L.polygon(coords, {
          color: '#090d16',
          weight: 3,
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(skMap);

        const center = bounds.getCenter();

        // Add dimensions to each line segment
        const latlngs = coords.map(c => L.latLng(c));
        
        // Calculate all segment lengths first
        const segments = latlngs.map((startPt, idx) => {
          const endPt = latlngs[(idx + 1) % latlngs.length];
          const dist = skMap.distance(startPt, endPt);
          return { startPt, endPt, dist, index: idx };
        });

        // Find the indices of the 4 longest segments (the main boundaries)
        const longestIndices = [...segments]
          .sort((a, b) => b.dist - a.dist)
          .slice(0, 4)
          .map(s => s.index);

        for (let i = 0; i < latlngs.length; i++) {
          const start = latlngs[i];
          const end = latlngs[(i + 1) % latlngs.length];
          const showDirection = longestIndices.includes(i);
          addSketchDimension(start, end, skMap, latlngs, showDirection);
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
      /* Map container background must be pure white */
      .leaflet-container {
        background-color: #ffffff !important;
        background: #ffffff !important;
      }
      /* Style distance labels for clean CAD text */
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
      /* Hide unit 'm' inside distance text if needed (we already formatted to 15.600) */
      .sketch-dist-label .dist-text {
        font-size: 11px !important;
        color: #000000 !important;
        font-weight: bold !important;
      }
      /* Make direction letters visible in the PDF */
      .sketch-dir-letter .dir-letter-val {
        display: block !important;
      }
      /* Style area label */
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
      /* Make all SVG paths (the polygon and the polylines) pure black */
      .leaflet-overlay-pane svg path {
        stroke: #000000 !important;
      }
    `;

    try {
      document.head.appendChild(styleEl);
      showAlert('Sug fadlan...', 'PDF-ka ayaa la diyaarinayaa, fadlan sug...', 'info');

      const html2pdf = (await import('html2pdf.js')).default;
      const html2canvas = (await import('html2canvas')).default;

      // Helper to temporarily convert Leaflet CSS transforms to left/top positions for html2canvas
      const prepareMapForCapture = (container: HTMLDivElement) => {
        const restoredElements: { el: HTMLElement; transform: string; left: string; top: string }[] = [];
        
        // 1. Temporarily REMOVE the zoom controls and attributions from the DOM to guarantee they won't render
        const controls = Array.from(container.querySelectorAll('.leaflet-control, .leaflet-control-zoom, .leaflet-control-attribution'));
        const removedControls = controls.map(c => {
          const el = c as HTMLElement;
          const parent = el.parentNode;
          const nextSibling = el.nextSibling;
          if (parent) {
            parent.removeChild(el);
          }
          return { el, parent, nextSibling };
        });

        // 2. Temporarily remove parent container's rounded corners and overflow to prevent html2canvas from cropping
        const parent = container.parentElement as HTMLElement;
        const originalParentStyle = parent ? parent.style.borderRadius : '';
        const originalParentOverflow = parent ? parent.style.overflow : '';
        const originalParentClassName = parent ? parent.className : '';
        if (parent) {
          parent.style.borderRadius = '0px';
          parent.style.overflow = 'visible';
          parent.className = parent.className.replace(/\brounded-\S+/g, '').replace('overflow-hidden', '');
        }

        // Target ONLY the leaflet-map-pane to prevent double-shifting nested sub-panes/markers
        const mapPane = container.querySelector('.leaflet-map-pane') as HTMLElement;
        if (mapPane) {
          const style = window.getComputedStyle(mapPane);
          const transform = style.transform || style.webkitTransform;
          
          if (transform && transform !== 'none') {
            let tx = 0;
            let ty = 0;
            
            if (transform.startsWith('matrix3d')) {
              const parts = transform.replace('matrix3d(', '').replace(')', '').split(',').map(parseFloat);
              if (parts.length >= 16) {
                tx = parts[12];
                ty = parts[13];
              }
            } else if (transform.startsWith('matrix')) {
              const parts = transform.replace('matrix(', '').replace(')', '').split(',').map(parseFloat);
              if (parts.length >= 6) {
                tx = parts[4];
                ty = parts[5];
              }
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
          // Restore parent container styles/classes
          if (parent) {
            parent.style.borderRadius = originalParentStyle;
            parent.style.overflow = originalParentOverflow;
            parent.className = originalParentClassName;
          }

          // Restore controls to DOM in their original positions
          removedControls.forEach(({ el, parent, nextSibling }) => {
            if (parent) {
              parent.insertBefore(el, nextSibling);
            }
          });
          
          // Restore positions
          restoredElements.forEach(({ el, transform, left, top }) => {
            el.style.transform = transform;
            el.style.left = left;
            el.style.top = top;
          });
        };
      };

      // 1. Capture Satellite Map as Image
      let satImage = '';
      if (satelliteMapContainerRef.current) {
        const restoreMap = prepareMapForCapture(satelliteMapContainerRef.current);
        try {
          const satCanvas = await html2canvas(satelliteMapContainerRef.current, {
            useCORS: true,
            scale: 2,
            logging: false
          });
          satImage = satCanvas.toDataURL('image/jpeg', 0.95);
        } catch (e) {
          console.error('Failed to capture satellite map', e);
        } finally {
          restoreMap();
        }
      }

      // 2. Capture Sketch Map as Image
      let sketchImage = '';
      if (sketchMapContainerRef.current) {
        const restoreSketch = prepareMapForCapture(sketchMapContainerRef.current);

        // Find and temporarily format the area box text to CAD style "Area = \n {value}"
        const areaBox = sketchMapContainerRef.current.querySelector('.modal-area-box') as HTMLElement;
        const originalAreaHTML = areaBox ? areaBox.innerHTML : '';
        if (areaBox) {
          const strongEl = areaBox.querySelector('strong');
          const areaNum = strongEl ? strongEl.innerText.replace(' m²', '').replace('m²', '').trim() : '';
          areaBox.innerHTML = `<div style="line-height: 1.3;">Area =<br/>${areaNum}</div>`;
        }

        // Temporarily change all Leaflet vector styles to pure black & white for CAD look
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
                fillOpacity: 1.0
              });
            } else if (layer instanceof L.Polyline) {
              // Dimension and extension lines
              layer.setStyle({
                color: '#000000',
                weight: 1.2
              });
            }
          }
        });

        try {
          const sketchCanvas = await html2canvas(sketchMapContainerRef.current, {
            useCORS: true,
            scale: 2,
            logging: false
          });
          sketchImage = sketchCanvas.toDataURL('image/jpeg', 0.95);
        } catch (e) {
          console.error('Failed to capture sketch map', e);
        } finally {
          // Restore original styles
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
        margin: 10,
        filename: `Survey_Report_SN_${record.serial_no}_${record.owner_name.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg' as const, quality: 1.0 },
        html2canvas: { scale: 2.5, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
        pagebreak: { mode: ['css', 'legacy'] },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      const gpsParts = record.gps_location ? record.gps_location.split(',') : [];
      const latVal = gpsParts[0] ? gpsParts[0].trim() : 'N/A';
      const lngVal = gpsParts[1] ? gpsParts[1].trim() : 'N/A';
      const areaClean = record.sketch_area ? record.sketch_area.replace(' m²', '').replace('m²', '').trim() : 'N/A';
      const issueDate = record.created_at ? new Date(record.created_at).toLocaleDateString('en-GB') : '-';
      const vertexCount = parsePolygonCoords(record.polygon_boundary).length;

      const cleanVal = (val: string | undefined) => {
        if (!val) return '-';
        return val.replace('m', '').replace('M', '').trim();
      };

      const headerHTML = `
        <div style="border-top:6px solid #2563eb;display:grid;grid-template-columns:1.2fr 1fr 1.2fr;gap:18px;align-items:center;border-bottom:1px solid #dbe3ef;padding:14px 0 12px;margin-bottom:12px;font-family:Arial,sans-serif;">
          <!-- Left Column: Somali -->
          <div style="font-size:9px;font-weight:700;line-height:1.45;color:#334155;text-align:left;">
            Dowladda Koonfur Galbeed Soomaaliya<br/>
            Dowladda Hoose ee Baydhabo<br/>
            <span style="color:#1d4ed8;">Waaxda Howlaha Guud iyo Maamulka Dhulka</span>
          </div>
          
          <!-- Center Column: Logo & English -->
          <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <svg width="52" height="52" viewBox="0 0 100 100" style="margin-bottom:5px;font-family:Arial,sans-serif;">
              <!-- Outer green ring -->
              <circle cx="50" cy="50" r="47" fill="#ffffff" stroke="#2563eb" stroke-width="4"/>
              <!-- Inner green circle -->
              <circle cx="50" cy="50" r="39" fill="none" stroke="#3b82f6" stroke-width="1" stroke-dasharray="2,2"/>
              <!-- Shield/Emblem base -->
              <path d="M 35,40 A 15,15 0 0,0 65,40 C 65,58 50,72 50,72 C 50,72 35,58 35,40 Z" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1.5"/>
              <!-- White star -->
              <polygon points="50,42 53,49 61,50 55,55 56,62 50,58 44,62 45,55 39,50 47,49" fill="#ffffff"/>
              <!-- Text paths -->
              <path id="curve-top" d="M 20,50 A 30,30 0 0,1 80,50" fill="none" stroke="none"/>
              <text font-size="6.5" font-weight="bold" fill="#1d4ed8" letter-spacing="0.5">
                <textPath href="#curve-top" startOffset="50%" text-anchor="middle">BAYDHABO</textPath>
              </text>
              <path id="curve-bottom" d="M 80,50 A 30,30 0 0,1 20,50" fill="none" stroke="none"/>
              <text font-size="6.5" font-weight="bold" fill="#1d4ed8" letter-spacing="0.5">
                <textPath href="#curve-bottom" startOffset="50%" text-anchor="middle">BAIDOA</textPath>
              </text>
            </svg>
            <div style="font-size:7.5px;font-weight:900;line-height:1.25;color:#0f172a;text-transform:uppercase;white-space:nowrap;letter-spacing:.15px;">
              Southwest State of Somalia<br/>
              Municipality of Baidoa<br/>
              Public works, Housing and land<br/>
              Administration Department
            </div>
          </div>

          <!-- Right Column: Arabic -->
          <div style="font-size: 9.5px; font-weight: bold; line-height: 1.4; color: #1e293b; text-align: right; direction: rtl;">
            ولاية جنوب غرب الصومال<br/>
            حكومة بلدية بيدوا<br/>
            إدارة الأشغال العامة والإسكان<br/>
            وإدارة الأراضي
          </div>
        </div>
      `;

      const footerHTML = (pageNum: number) => `
        <div style="display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;border-top:1px solid #dbe3ef;padding-top:8px;font-family:Arial,sans-serif;">
          <div style="font-size:7.5px;font-weight:900;color:#1d4ed8;">GEOSURVEY PRO</div>
          <div style="text-align:center;font-size:7.5px;color:#64748b;">hssnmoalim@gmail.com&nbsp; | &nbsp;+252 611122205&nbsp; | &nbsp;Baidoa - Somalia</div>
          <div style="text-align:right;font-size:8px;font-weight:900;color:#0f172a;">PAGE ${pageNum} / 3</div>
        </div>
      `;

      const printContainer = document.createElement('div');
      printContainer.className = 'bg-white text-slate-950 font-sans';
      printContainer.style.width = '750px';

      printContainer.innerHTML = `
        <style>
          .survey-table { width:100% !important; border-collapse:separate !important; border-spacing:0 !important; border:1px solid #dbe3ef !important; border-radius:11px !important; overflow:hidden !important; font-size:9px !important; }
          .survey-table th { padding:8px 10px !important; background:#eff6ff !important; color:#1e3a8a !important; border:0 !important; border-bottom:1px solid #bfdbfe !important; text-align:left !important; font-size:8px !important; letter-spacing:.5px !important; text-transform:uppercase !important; }
          .survey-table td { padding:8px 10px !important; border:0 !important; border-bottom:1px solid #e2e8f0 !important; color:#334155 !important; }
          .survey-table tr:last-child td { border-bottom:0 !important; }
          .survey-table td:first-child { font-weight:900 !important; color:#0f172a !important; }
          .pdf-section-kicker { display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:#2563eb;color:#fff;font-size:9px;font-weight:900;margin-right:8px; }
        </style>
        <!-- Page 1: Details & Tables -->
        <div style="min-height:980px;padding:22px 28px 18px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#0f172a;page-break-inside:avoid;page-break-after:always;">
          <div>
            ${headerHTML}
            
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0 18px;">
              <div style="border:1px solid #dbe3ef;border-radius:10px;padding:9px 11px;background:#f8fafc;">
                <div style="font-size:7px;font-weight:900;letter-spacing:.8px;color:#64748b;">DOCUMENT ID</div>
                <div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">SRV-${record.serial_no}</div>
              </div>
              <div style="border:1px solid #dbe3ef;border-radius:10px;padding:9px 11px;background:#f8fafc;">
                <div style="font-size:7px;font-weight:900;letter-spacing:.8px;color:#64748b;">ISSUE DATE</div>
                <div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">${issueDate}</div>
              </div>
              <div style="border:1px solid #bfdbfe;border-radius:10px;padding:9px 11px;background:#eff6ff;">
                <div style="font-size:7px;font-weight:900;letter-spacing:.8px;color:#2563eb;">DOCUMENT STATUS</div>
                <div style="margin-top:3px;font-size:11px;font-weight:900;color:#1d4ed8;">OFFICIAL RECORD</div>
              </div>
            </div>

            <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;">
              <div>
                <div style="font-size:8px;font-weight:900;letter-spacing:1.2px;color:#2563eb;">LAND ADMINISTRATION • SURVEY 01</div>
                <h2 style="font-size:22px;font-weight:900;color:#0f172a;margin:4px 0 0;letter-spacing:-.4px;">Official Land Survey Report</h2>
              </div>
              <div style="font-size:8px;color:#64748b;text-align:right;line-height:1.5;">Digitally prepared record<br/>Baidoa Municipality</div>
            </div>

            <div style="border:1px solid #dbe3ef;border-radius:14px;overflow:hidden;margin-bottom:16px;">
              <div style="background:#0f172a;color:#ffffff;padding:8px 12px;font-size:8px;font-weight:900;letter-spacing:.9px;">PARCEL &amp; OWNERSHIP INFORMATION</div>
              <div style="display:grid;grid-template-columns:1.35fr 1fr 1fr;">
                <div style="padding:12px;border-right:1px solid #e2e8f0;">
                  <div style="font-size:7px;font-weight:900;color:#64748b;letter-spacing:.7px;">REGISTERED OWNER</div>
                  <div style="margin-top:4px;font-size:13px;font-weight:900;color:#0f172a;">${record.owner_name}</div>
                  <div style="margin-top:4px;font-size:8px;color:#64748b;">Primary survey record holder</div>
                </div>
                <div style="padding:12px;border-right:1px solid #e2e8f0;">
                  <div style="font-size:7px;font-weight:900;color:#64748b;letter-spacing:.7px;">PLOT LOCATION</div>
                  <div style="margin-top:4px;font-size:11px;font-weight:900;color:#0f172a;">${record.neighborhood}</div>
                  <div style="margin-top:4px;font-size:8px;color:#64748b;">Branch ${record.branch || '-'}</div>
                </div>
                <div style="padding:12px;">
                  <div style="font-size:7px;font-weight:900;color:#64748b;letter-spacing:.7px;">LAND TYPE</div>
                  <div style="margin-top:4px;font-size:11px;font-weight:900;color:#0f172a;">${record.land_type || '-'}</div>
                  <div style="margin-top:4px;font-size:8px;color:#64748b;">${record.vicinity || 'Registered parcel'}</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid #e2e8f0;background:#f8fafc;">
                <div style="padding:9px 12px;border-right:1px solid #e2e8f0;"><span style="font-size:7px;font-weight:900;color:#64748b;">TOTAL AREA</span><div style="margin-top:3px;font-size:12px;font-weight:900;color:#1d4ed8;">${areaClean} m²</div></div>
                <div style="padding:9px 12px;border-right:1px solid #e2e8f0;"><span style="font-size:7px;font-weight:900;color:#64748b;">LATITUDE</span><div style="margin-top:3px;font-size:10px;font-weight:800;color:#0f172a;">${latVal}</div></div>
                <div style="padding:9px 12px;"><span style="font-size:7px;font-weight:900;color:#64748b;">LONGITUDE</span><div style="margin-top:3px;font-size:10px;font-weight:800;color:#0f172a;">${lngVal}</div></div>
              </div>
            </div>

            <!-- Table 1: PLOT MEASUREMENTS -->
            <div style="margin-bottom:14px;">
              <h3 style="display:flex;align-items:center;font-size:10px;font-weight:900;color:#0f172a;margin:0 0 8px;text-transform:uppercase;"><span class="pdf-section-kicker">01</span> Plot Measurements</h3>
              <table class="survey-table" style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1.5px solid #000000; text-align: left;">
                <thead>
                  <tr style="background-color: #f1f5f9; border-bottom: 1.5px solid #000000; color: #000000; font-weight: bold;">
                    <th style="padding: 6px 8px; border: 1.5px solid #000000; text-align: center; width: 40%;">Side</th>
                    <th style="padding: 6px 8px; border: 1.5px solid #000000; text-align: center; width: 60%;">Length (m)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">North</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${cleanVal(record.boundary_w_val)}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">East</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${cleanVal(record.boundary_b_val)}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">West</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${cleanVal(record.boundary_g_val)}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">South</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${cleanVal(record.boundary_k_val)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Table 2: NEIGHBOURING DIRECTIONS -->
            <div style="margin-bottom:12px;">
              <h3 style="display:flex;align-items:center;font-size:10px;font-weight:900;color:#0f172a;margin:0 0 8px;text-transform:uppercase;"><span class="pdf-section-kicker">02</span> Neighbouring Directions</h3>
              <table class="survey-table" style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #000000; text-align: left;">
                <thead>
                  <tr style="background-color: #f1f5f9; border-bottom: 1.5px solid #000000; color: #000000; font-weight: bold;">
                    <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center; width: 40%;">Direction</th>
                    <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center; width: 60%;">What is next to the land?</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">North</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000;">${record.boundary_w_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">East</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000;">${record.boundary_b_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">West</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000;">${record.boundary_g_neighbor || '-'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000000;">
                    <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #000000; text-align: center;">South</td>
                    <td style="padding: 6px 8px; border: 1px solid #000000;">${record.boundary_k_neighbor || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          ${footerHTML(1)}
        </div>

        <!-- Page 2: Technical Sketch Drawing -->
        <div style="min-height:980px;padding:22px 28px 18px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#0f172a;page-break-inside:avoid;page-break-after:always;">
          <div>
            ${headerHTML}
            
            <div style="display:flex;align-items:flex-end;justify-content:space-between;margin:18px 0 14px;">
              <div>
                <div style="font-size:8px;font-weight:900;letter-spacing:1.2px;color:#2563eb;">TECHNICAL DRAWING • SURVEY 02</div>
                <h2 style="font-size:21px;font-weight:900;color:#0f172a;margin:4px 0 0;letter-spacing:-.35px;">Parcel Sketch &amp; Dimensions</h2>
              </div>
              <div style="border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;padding:7px 10px;font-size:8px;font-weight:900;color:#1d4ed8;">REF SRV-${record.serial_no}</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
              <div style="padding:9px 10px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;"><div style="font-size:7px;font-weight:900;color:#64748b;">AREA</div><div style="margin-top:3px;font-size:11px;font-weight:900;color:#1d4ed8;">${areaClean} m²</div></div>
              <div style="padding:9px 10px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;"><div style="font-size:7px;font-weight:900;color:#64748b;">VERTICES</div><div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">${vertexCount || '-'}</div></div>
              <div style="padding:9px 10px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;"><div style="font-size:7px;font-weight:900;color:#64748b;">NORTH SIDE</div><div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">${cleanVal(record.boundary_w_val)} m</div></div>
              <div style="padding:9px 10px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;"><div style="font-size:7px;font-weight:900;color:#64748b;">SOUTH SIDE</div><div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">${cleanVal(record.boundary_k_val)} m</div></div>
            </div>

            <div style="border:1px solid #dbe3ef;border-radius:14px;overflow:hidden;background:#ffffff;padding:12px;box-sizing:border-box;box-shadow:0 8px 24px rgba(15,23,42,.04);">
              ${sketchImage ? `<img src="${sketchImage}" style="display:block;width:100%;height:500px;object-fit:contain;background:#ffffff;" />` : `<div style="height:500px;display:flex;align-items:center;justify-content:center;color:#94a3b8;background:#f8fafc;font-size:11px;">Sketch image not available</div>`}
            </div>

            <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:12px;margin-top:14px;">
              <div style="border:1px solid #dbe3ef;border-radius:11px;padding:11px 12px;background:#f8fafc;">
                <div style="font-size:7px;font-weight:900;color:#2563eb;letter-spacing:.7px;">TECHNICAL NOTE</div>
                <div style="margin-top:4px;font-size:8.5px;line-height:1.55;color:#475569;">The parcel outline and measured sides shown above form part of the official survey record. Dimensions are stated in metres.</div>
              </div>
              <div style="border:1px solid #dbe3ef;border-radius:11px;padding:11px 12px;background:#ffffff;">
                <div style="font-size:7px;font-weight:900;color:#64748b;">SURVEYOR</div>
                <div style="margin-top:5px;font-size:9px;font-weight:900;color:#0f172a;">Eng. Salah Ali Mohamed</div>
                <div style="margin-top:13px;border-top:1px solid #94a3b8;padding-top:4px;font-size:7px;color:#64748b;">Signature / Stamp</div>
              </div>
            </div>
          </div>

          ${footerHTML(2)}
        </div>

        <!-- Page 3: Satellite View Map -->
        <div style="min-height:980px;padding:22px 28px 18px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Arial,sans-serif;background:#ffffff;color:#0f172a;page-break-inside:avoid;">
          <div>
            ${headerHTML}
            
            <div style="display:flex;align-items:flex-end;justify-content:space-between;margin:18px 0 14px;">
              <div>
                <div style="font-size:8px;font-weight:900;letter-spacing:1.2px;color:#2563eb;">GEOSPATIAL REFERENCE • SURVEY 03</div>
                <h2 style="font-size:21px;font-weight:900;color:#0f172a;margin:4px 0 0;letter-spacing:-.35px;">Satellite Location Reference</h2>
              </div>
              <div style="font-size:8px;color:#64748b;text-align:right;line-height:1.45;">Parcel ${record.serial_no}<br/>${record.neighborhood}, Baidoa</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr .8fr;gap:8px;margin-bottom:14px;">
              <div style="padding:10px 12px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;"><div style="font-size:7px;font-weight:900;color:#2563eb;">LATITUDE</div><div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">${latVal}</div></div>
              <div style="padding:10px 12px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;"><div style="font-size:7px;font-weight:900;color:#2563eb;">LONGITUDE</div><div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">${lngVal}</div></div>
              <div style="padding:10px 12px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;"><div style="font-size:7px;font-weight:900;color:#64748b;">DATUM</div><div style="margin-top:3px;font-size:11px;font-weight:900;color:#0f172a;">WGS 84</div></div>
            </div>

            <div style="border:1px solid #dbe3ef;border-radius:14px;overflow:hidden;background:#ffffff;padding:7px;box-sizing:border-box;box-shadow:0 8px 24px rgba(15,23,42,.06);">
              ${satImage ? `<img src="${satImage}" style="display:block;width:100%;height:500px;object-fit:cover;border-radius:9px;background:#e2e8f0;" />` : `<div style="height:500px;display:flex;align-items:center;justify-content:center;color:#94a3b8;background:#f8fafc;font-size:11px;">Map image not available</div>`}
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding:8px 10px;border:1px solid #dbe3ef;border-radius:9px;background:#f8fafc;">
              <div style="display:flex;align-items:center;gap:7px;font-size:8px;font-weight:800;color:#334155;"><span style="display:inline-block;width:20px;height:3px;background:#dc2626;border-radius:3px;"></span> Surveyed parcel boundary</div>
              <div style="font-size:7.5px;color:#64748b;">Satellite imagery is a location reference and not a substitute for field verification.</div>
            </div>

            <div style="display:grid;grid-template-columns:1.45fr 1fr;gap:12px;margin-top:12px;">
              <div style="padding:11px 12px;border:1px solid #dbe3ef;border-radius:11px;background:#ffffff;">
                <div style="font-size:7px;font-weight:900;color:#2563eb;letter-spacing:.7px;">CERTIFICATION</div>
                <div style="margin-top:4px;font-size:8.5px;line-height:1.5;color:#475569;">This geospatial reference corresponds to the parcel described in Survey Record SRV-${record.serial_no} and is filed for municipal land administration use.</div>
              </div>
              <div style="padding:11px 12px;border:1px solid #dbe3ef;border-radius:11px;background:#f8fafc;">
                <div style="font-size:7px;font-weight:900;color:#64748b;">AUTHORIZED APPROVAL</div>
                <div style="margin-top:20px;border-top:1px solid #94a3b8;padding-top:4px;font-size:7px;color:#64748b;">Name, signature and official stamp</div>
              </div>
            </div>
          </div>

          ${footerHTML(3)}
        </div>
      `;

      await html2pdf().set(options).from(printContainer).save();
      showAlert('Guul', 'PDF-ka waa la soo dejiyay.', 'success');

    } catch (err) {
      console.error('Error generating PDF:', err);
      showAlert('Cillad', 'Ma suuragalin in PDF-ka la soo dejiyo.', 'error');
    } finally {
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

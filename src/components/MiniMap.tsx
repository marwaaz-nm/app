'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Compass, Fullscreen, Navigation, Loader2, MapPin, MousePointer2, PencilRuler, ZoomIn } from 'lucide-react';
import L from 'leaflet';
import { useModal } from '@/context/ModalContext';

// Assign L to window so leaflet-draw can find it on the client
if (typeof window !== 'undefined') {
  (window as any).L = L;
  require('leaflet-draw');

  // leaflet-draw's touch handler for polygon/polyline vertices reads the touch's
  // start and end position from the same `touchstart` event, so it always measures
  // zero movement and drops a vertex the instant a finger touches the map — before
  // a drag/pan gesture can happen. This makes it impossible to pan while drawing on
  // mobile. Patch it to track the real touchend position, matching how it already
  // behaves with a mouse (only add a vertex if the finger barely moved).
  const PolylineDrawProto = (L as any).Draw?.Polyline?.prototype;
  if (PolylineDrawProto && !PolylineDrawProto.__touchPanPatched) {
    PolylineDrawProto.__touchPanPatched = true;
    PolylineDrawProto._onTouch = function (e: any) {
      const originalEvent = e.originalEvent as TouchEvent;
      const touch = originalEvent.touches && originalEvent.touches[0];
      if (!touch || this._clickHandled || this._touchHandled || this._disableMarkers) {
        this._clickHandled = null;
        return;
      }

      this._disableNewMarkers();
      this._touchHandled = true;
      this._startPoint.call(this, touch.clientX, touch.clientY);

      const map = this._map;
      const cleanup = () => {
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchCancel);
      };
      const onTouchEnd = (endEvent: TouchEvent) => {
        cleanup();
        const endTouch = endEvent.changedTouches[0] || touch;
        const latlng = map.mouseEventToLatLng({ clientX: endTouch.clientX, clientY: endTouch.clientY } as unknown as MouseEvent);
        this._endPoint.call(this, endTouch.clientX, endTouch.clientY, { latlng });
        this._touchHandled = null;
      };
      const onTouchCancel = () => {
        cleanup();
        this._touchHandled = null;
        this._mouseDownOrigin = null;
        this._enableNewMarkers();
      };

      document.addEventListener('touchend', onTouchEnd, { once: true });
      document.addEventListener('touchcancel', onTouchCancel, { once: true });
      this._clickHandled = null;
    };
  }
}

interface MiniMapProps {
  gpsValue: string;
  onGpsChange: (value: string) => void;
  polygonValue: string;
  onPolygonChange: (value: string) => void;
  onSketchDetailsChange: (value: string) => void;
}

const createGpsMarkerIcon = (isCurrentLocation: boolean) =>
  L.divIcon({
    className: 'gps-position-icon',
    html: isCurrentLocation
      ? `<div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;width:30px;height:30px;border-radius:999px;background:rgba(37,99,235,.18);animation:pulse 1.8s ease-out infinite;"></span>
          <span style="position:relative;width:16px;height:16px;border-radius:999px;background:#2563eb;border:4px solid white;box-shadow:0 4px 12px rgba(15,23,42,.3);"></span>
          <span style="position:absolute;left:50%;top:-2px;transform:translateX(-50%);white-space:nowrap;border-radius:8px;background:white;padding:3px 7px;font:800 10px/1 sans-serif;color:#1e293b;box-shadow:0 4px 12px rgba(15,23,42,.18);">0 m</span>
        </div>`
      : `<div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
          <span style="width:16px;height:16px;border-radius:999px;background:#2563eb;border:4px solid white;box-shadow:0 4px 12px rgba(15,23,42,.3);"></span>
        </div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });

const createMapMeasurementIcon = (distance: number, isLive = false) =>
  L.divIcon({
    className: 'map-segment-measure-marker',
    html: `<div class="map-segment-measure-label${isLive ? ' is-live' : ''}">${distance < 1000 ? `${distance.toFixed(1)} m` : `${(distance / 1000).toFixed(2)} km`}</div>`,
    iconSize: [64, 22],
    iconAnchor: [32, 32],
  });

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
  const measurementLayerRef = useRef<L.LayerGroup | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [showSketch, setShowSketch] = useState(false);
  const [locating, setLocating] = useState(false);
  const [isAtCurrentLocation, setIsAtCurrentLocation] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  // Keep the map collapsed until a location exists (GPS pressed or coordinates typed),
  // so the heavy satellite map doesn't take up space before it's needed. Once revealed,
  // it stays mounted even if the coordinates field is cleared afterwards.
  const [mapUnlocked, setMapUnlocked] = useState(false);

  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (gpsValue.trim() && !mapUnlocked) setMapUnlocked(true);
  }, [gpsValue, mapUnlocked]);

  // Initialize Drawing Map (declared before the marker-sync effect below so that,
  // once mapUnlocked flips true and the container mounts, the map exists in the same
  // commit before the marker-sync effect runs and tries to use it).
  useEffect(() => {
    if (!mapUnlocked || !mapContainerRef.current || mapRef.current) return;

    // Satellite tiles
    const satLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    });

    let initialCenter: L.LatLngExpression = [3.1192, 43.6498];
    if (gpsValue) {
      const parts = gpsValue.split(',').map(p => p.trim());
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          initialCenter = [lat, lng];
        }
      }
    }

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 17,
      layers: [satLayer],
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true,
      dragging: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Feature group for drawn items
    const drawnItems = new L.FeatureGroup().addTo(map);
    drawnItemsRef.current = drawnItems;

    const measurementLayer = new L.LayerGroup().addTo(map);
    measurementLayerRef.current = measurementLayer;
    let drawingVertices: L.LatLng[] = [];
    let liveMeasurementMarker: L.Marker | null = null;
    let drawingWasCompleted = false;

    const drawSegmentMeasurements = (coords: L.LatLng[], includeClosingSegment: boolean) => {
      measurementLayer.clearLayers();
      liveMeasurementMarker = null;

      const segmentCount = includeClosingSegment ? coords.length : Math.max(coords.length - 1, 0);
      for (let index = 0; index < segmentCount; index += 1) {
        const start = coords[index];
        const end = coords[(index + 1) % coords.length];
        if (!start || !end) continue;

        const midpoint = L.latLng((start.lat + end.lat) / 2, (start.lng + end.lng) / 2);
        L.marker(midpoint, {
          interactive: false,
          keyboard: false,
          icon: createMapMeasurementIcon(map.distance(start, end)),
          zIndexOffset: 1200,
        }).addTo(measurementLayer);
      }
    };

    // Add Draw control
    const drawControl = new (L.Control as any).Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          metric: true,
          feet: false,
          showLength: false,
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

    // Track drawing state to avoid click conflicts
    map.on('draw:drawstart', () => {
      isDrawingRef.current = true;
      drawingWasCompleted = false;
      drawingVertices = [];
      measurementLayer.clearLayers();
      liveMeasurementMarker = null;
    });
    map.on('draw:drawstop', () => {
      isDrawingRef.current = false;
      drawingVertices = [];
      liveMeasurementMarker = null;
      if (!drawingWasCompleted) measurementLayer.clearLayers();
      drawingWasCompleted = false;
    });

    map.on((L as any).Draw.Event.DRAWVERTEX, (event: L.LeafletEvent) => {
      const vertexLayers = (event as L.LeafletEvent & { layers: L.LayerGroup }).layers;
      drawingVertices = vertexLayers.getLayers()
        .filter((layer): layer is L.Marker => layer instanceof L.Marker)
        .map((marker) => marker.getLatLng());
      drawSegmentMeasurements(drawingVertices, false);
    });

    map.on('mousemove', (event: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current || drawingVertices.length === 0) return;

      const start = drawingVertices[drawingVertices.length - 1];
      const distance = map.distance(start, event.latlng);

      if (liveMeasurementMarker) {
        liveMeasurementMarker.setLatLng(event.latlng);
        liveMeasurementMarker.setIcon(createMapMeasurementIcon(distance, true));
      } else {
        liveMeasurementMarker = L.marker(event.latlng, {
          interactive: false,
          keyboard: false,
          icon: createMapMeasurementIcon(distance, true),
          zIndexOffset: 1300,
        }).addTo(measurementLayer);
      }
    });

    // Map Click Listener to place marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (isDrawingRef.current) return;
      const { lat, lng } = e.latlng;
      setIsAtCurrentLocation(false);
      setLocationAccuracy(null);
      onGpsChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      map.panTo([lat, lng]);
    });

    // Draw Event Listener
    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);

      // Handle polygon coordinates
      const latlngs = layer.getLatLngs()[0] as L.LatLng[];
      drawingWasCompleted = true;
      drawSegmentMeasurements(latlngs, true);
      const polyString = latlngs.map(c => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join('; ');
      onPolygonChange(polyString);

      // Update Center Coordinate as GPS Input
      const center = layer.getBounds().getCenter();
      setIsAtCurrentLocation(false);
      setLocationAccuracy(null);
      onGpsChange(`${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`);

      // Draw Sketch
      generateSketch(latlngs, layer.getBounds());
    });

    // Dragging an existing polygon's vertices with the Edit toolbar only fires
    // draw:edited (on Save) — CREATED above only covers a brand-new shape, so without
    // this the segment-length labels, onPolygonChange, and the sketch/area all stayed
    // frozen at whatever they were when the polygon was first drawn.
    map.on((L as any).Draw.Event.EDITED, (event: L.LeafletEvent) => {
      const editedLayers = (event as L.LeafletEvent & { layers: L.LayerGroup }).layers;
      editedLayers.eachLayer((layer: L.Layer) => {
        if (typeof (layer as L.Polygon).getLatLngs !== 'function') return;
        const polygonLayer = layer as L.Polygon;
        const latlngs = polygonLayer.getLatLngs()[0] as L.LatLng[];
        drawSegmentMeasurements(latlngs, true);
        const polyString = latlngs.map((c: L.LatLng) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join('; ');
        onPolygonChange(polyString);

        const center = polygonLayer.getBounds().getCenter();
        setIsAtCurrentLocation(false);
        setLocationAccuracy(null);
        onGpsChange(`${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`);

        generateSketch(latlngs, polygonLayer.getBounds());
      });
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
  }, [mapUnlocked]);

  // Sync marker when gpsValue is set (either from manual input, live location, click, or initial load)
  useEffect(() => {
    if (!mapRef.current || !gpsValue) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const parts = gpsValue.split(',').map(p => p.trim());
    if (parts.length !== 2) return;

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    const markerIcon = createGpsMarkerIcon(isAtCurrentLocation);

    if (markerRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (currentPos.lat !== lat || currentPos.lng !== lng) {
        markerRef.current.setLatLng([lat, lng]);
      }
      markerRef.current.setIcon(markerIcon);
    } else {
      const marker = L.marker([lat, lng], { draggable: true, icon: markerIcon }).addTo(mapRef.current);
      marker.on('dragstart', () => {
        setIsAtCurrentLocation(false);
        setLocationAccuracy(null);
      });
      marker.on('dragend', (event) => {
        const markerPos = event.target.getLatLng();
        onGpsChange(`${markerPos.lat.toFixed(6)}, ${markerPos.lng.toFixed(6)}`);
      });
      markerRef.current = marker;
    }
  }, [gpsValue, isAtCurrentLocation, onGpsChange, mapUnlocked]);

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

    L.polyline([p1, p2], { color: '#2563eb', weight: 1.5, opacity: 0.72 }).addTo(map);

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
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        boxZoom: true,
        keyboard: true,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(skMap);

      L.polygon(latlngs, {
        color: '#0f172a',
        weight: 2.5,
        fillColor: '#dbeafe',
        fillOpacity: 0.42,
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
      skMap.fitBounds(bounds.pad(0.08), { animate: false });
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
        const { latitude, longitude, accuracy } = pos.coords;
        setIsAtCurrentLocation(true);
        setLocationAccuracy(Math.round(accuracy));
        onGpsChange(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        
        if (mapRef.current) {
          // Just settle on the resolved point (the marker itself shows the live-location
          // pulse) rather than drawing a separate accuracy circle across the map.
          mapRef.current.flyTo([latitude, longitude], Math.max(mapRef.current.getZoom(), 19), { duration: 1.1 });
        }
        setLocating(false);
      },
      (err) => {
        console.error('Error fetching location:', err);
        showAlert('Cillad', 'Ma suuragalin in GPS-kaaga la soo helo.', 'error');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleGpsInputChange = (value: string) => {
    setIsAtCurrentLocation(false);
    setLocationAccuracy(null);

    onGpsChange(value);
    const parts = value.split(',').map((part) => part.trim());
    if (parts.length !== 2) return;

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      onGpsChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      if (mapRef.current) {
        mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 18), { duration: 0.8 });
      }
    }
  };

  const toggleFullScreen = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-teal-600">
              <Compass className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-700">Location &amp; Boundary</p>
              <p className="mt-0.5 text-[9px] font-medium text-slate-400">Guji maabka ama isticmaal goobta aad hadda joogto.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500">
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">1. Dooro goobta</span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">2. Sawir polygon</span>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">GPS Coordinates (Latitude, Longitude)</span>
            <span className="relative flex items-center">
              <MapPin className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
              <input
                type="text"
                inputMode="decimal"
                value={gpsValue}
                onChange={(event) => handleGpsInputChange(event.target.value)}
                placeholder="3.119200, 43.649800"
                aria-label="GPS latitude and longitude"
                className="w-full rounded-2xl border border-slate-200/80 bg-white py-3.5 pl-11 pr-4 font-mono text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              />
            </span>
          </label>

          <button
            type="button"
            onClick={getLiveLocation}
            disabled={locating}
            className="flex h-[50px] cursor-pointer items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)] transition-all hover:-translate-y-0.5 hover:bg-teal-500 disabled:cursor-wait disabled:bg-slate-400"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            {locating ? 'Helayaa goobta...' : 'Exact Location'}
          </button>

          <div className={`flex h-[50px] items-center justify-center gap-2 rounded-2xl border px-4 ${isAtCurrentLocation ? 'border-blue-200 bg-blue-50 text-teal-700' : 'border-slate-200 bg-white text-slate-500'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${isAtCurrentLocation ? 'bg-teal-500 shadow-[0_0_0_4px_rgba(59,130,246,0.13)]' : 'bg-slate-300'}`} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.1em]">
                {isAtCurrentLocation ? 'Distance: 0 m' : 'GPS not active'}
              </p>
              {isAtCurrentLocation && locationAccuracy !== null && (
                <p className="mt-0.5 text-[8px] font-bold text-slate-500">Accuracy: +/-{locationAccuracy} m</p>
              )}
            </div>
          </div>
        </div>
        
        {mapUnlocked ? (
          <div
            className={`relative z-0 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-[0_8px_28px_rgba(15,23,42,0.08)] transition-all duration-300 ${
              isExpanded
                ? 'fixed inset-0 z-40 pb-20 md:left-[252px] md:pb-0'
                : 'h-[460px] w-full'
            }`}
          >
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Map controls */}
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
              <button
                type="button"
                onClick={getLiveLocation}
                disabled={locating}
                className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-600 px-3.5 text-[10px] font-extrabold text-white shadow-[0_8px_22px_rgba(37,99,235,0.3)] transition-all hover:-translate-y-0.5 hover:bg-teal-500 disabled:cursor-wait disabled:bg-slate-400"
                aria-label="Go to my current location"
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                <span className="hidden sm:inline">{locating ? 'Locating...' : 'My Location'}</span>
              </button>
              <button
                type="button"
                onClick={toggleFullScreen}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-slate-50"
                aria-label={isExpanded ? 'Exit full screen map' : 'Open full screen map'}
                title={isExpanded ? 'Exit full screen' : 'Full screen'}
              >
                <Fullscreen className="h-[18px] w-[18px]" />
              </button>
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
              <MapPin className="h-5 w-5" />
            </span>
            <p className="max-w-xs text-xs font-bold text-slate-500">
              Maabku wuxuu soo muuqan doonaa marka aad geliso GPS coordinates ama aad riixdo &quot;Exact Location&quot;.
            </p>
          </div>
        )}
      </div>

      {/* Technical Sketch Preview Card */}
      {showSketch && (
        <div className="animate-in overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-col gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]">
                <PencilRuler className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-600">Technical Sketch</p>
                <h3 className="mt-1 text-sm font-extrabold text-slate-900">Qaabka iyo cabbirrada dhulka</h3>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500">Double-click ku samee cabbir ama area si aad wax uga beddesho.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[9px] font-bold text-slate-600">
                <MousePointer2 className="h-3.5 w-3.5 text-blue-600" /> Editable
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[9px] font-bold text-slate-600">
                <ZoomIn className="h-3.5 w-3.5 text-blue-600" /> Zoom &amp; Pan
              </span>
            </div>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <div className="sketch-map-shell overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-inner shadow-slate-100">
              <div ref={sketchContainerRef} className="sketch-map-canvas h-[420px] w-full rounded-xl bg-white" />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-[9px] font-semibold text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Isticmaal + / − ama mouse wheel si aad u zoom-gareyso.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

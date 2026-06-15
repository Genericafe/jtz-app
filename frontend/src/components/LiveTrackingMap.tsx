import { useEffect, useRef, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPoint { lat: number; lng: number; accuracy?: number }

interface Props {
  track: MapPoint[];
  referenceRoute?: MapPoint[];
  currentPos?: MapPoint;
  heading?: number | null;
  className?: string;
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

const lineFeature = (points: MapPoint[]) => ({
  type: 'Feature' as const,
  geometry: { type: 'LineString' as const, coordinates: points.map(p => [p.lng, p.lat]) },
  properties: {},
});

const emptyLine = () => ({
  type: 'Feature' as const,
  geometry: { type: 'LineString' as const, coordinates: [] as number[][] },
  properties: {},
});

const pointFeature = (p: MapPoint) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  properties: {},
});

const emptyPoint = () => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [0, 0] },
  properties: { hidden: true },
});

/** Closest point index on the route ahead of current position */
function closestAheadIdx(route: MapPoint[], pos: MapPoint, pastIdx: number): number {
  let minDist = Infinity, best = pastIdx;
  const search = Math.min(route.length, pastIdx + 80);
  for (let i = pastIdx; i < search; i++) {
    const dx = route[i].lng - pos.lng, dy = route[i].lat - pos.lat;
    const d = dx * dx + dy * dy;
    if (d < minDist) { minDist = d; best = i; }
  }
  // Pick a point slightly ahead so the marker is in front of the user
  return Math.min(best + 5, route.length - 1);
}

const LiveTrackingMap = memo(function LiveTrackingMap({
  track, referenceRoute, currentPos, heading, className = '',
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const autoFollowRef   = useRef(true);
  const readyRef        = useRef(false);
  const routeIdxRef     = useRef(0);
  const startMarkerRef  = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef    = useRef<maplibregl.Marker | null>(null);

  // ── Map initialisation (runs once) ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const startCenter: [number, number] =
      referenceRoute && referenceRoute.length > 0
        ? [referenceRoute[0].lng, referenceRoute[0].lat]
        : currentPos
          ? [currentPos.lng, currentPos.lat]
          : [-99.133, 19.432];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: startCenter,
      zoom: 15,
      attributionControl: false,
      pitchWithRotate: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.on('dragstart', () => { autoFollowRef.current = false; });

    // Center on real GPS when no reference route available
    if (!referenceRoute?.length && !currentPos && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mapRef.current) return;
          mapRef.current.setCenter([pos.coords.longitude, pos.coords.latitude]);
        },
        () => {},
        { timeout: 8000, maximumAge: 60000 },
      );
    }

    map.on('load', () => {
      readyRef.current = true;

      // ── Reference route ──────────────────────────────────────────────────
      map.addSource('ref-route', {
        type: 'geojson',
        data: (referenceRoute && referenceRoute.length >= 2
          ? lineFeature(referenceRoute) : emptyLine()) as any,
      });
      // Outer glow/casing
      map.addLayer({
        id: 'ref-route-casing',
        type: 'line',
        source: 'ref-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1d4ed8', 'line-width': 10, 'line-opacity': 0.35, 'line-blur': 4 },
      });
      // Main route line
      map.addLayer({
        id: 'ref-route-line',
        type: 'line',
        source: 'ref-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#60a5fa', 'line-width': 5, 'line-opacity': 0.95 },
      });

      // Next-waypoint pulsing marker
      map.addSource('next-point', { type: 'geojson', data: emptyPoint() as any });
      map.addLayer({
        id: 'next-point-glow',
        type: 'circle',
        source: 'next-point',
        filter: ['!=', ['get', 'hidden'], true],
        paint: { 'circle-radius': 22, 'circle-color': '#60a5fa', 'circle-opacity': 0.2, 'circle-blur': 1 },
      });
      map.addLayer({
        id: 'next-point-dot',
        type: 'circle',
        source: 'next-point',
        filter: ['!=', ['get', 'hidden'], true],
        paint: {
          'circle-radius': 8, 'circle-color': '#93c5fd',
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
        },
      });

      // Place start/end markers if route already loaded
      if (referenceRoute && referenceRoute.length >= 2) {
        placeRouteMarkers(map, referenceRoute);
        fitRoute(map, referenceRoute);
      }

      // ── Live track ───────────────────────────────────────────────────────
      map.addSource('live-track', {
        type: 'geojson',
        data: (track.length >= 2 ? lineFeature(track) : emptyLine()) as any,
      });
      map.addLayer({
        id: 'live-track-casing',
        type: 'line',
        source: 'live-track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#14532d', 'line-width': 10, 'line-opacity': 0.4 },
      });
      map.addLayer({
        id: 'live-track-line',
        type: 'line',
        source: 'live-track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#22c55e', 'line-width': 5, 'line-opacity': 1 },
      });

      // ── Current position ─────────────────────────────────────────────────
      const initPos = currentPos ?? (track.length > 0 ? track[track.length - 1] : null);
      map.addSource('current-pos', {
        type: 'geojson',
        data: (initPos ? pointFeature(initPos) : {
          type: 'Feature', geometry: { type: 'Point', coordinates: startCenter }, properties: {},
        }) as any,
      });
      map.addLayer({
        id: 'pos-accuracy',
        type: 'circle',
        source: 'current-pos',
        paint: { 'circle-radius': 28, 'circle-color': '#3b82f6', 'circle-opacity': 0.1 },
      });
      map.addLayer({
        id: 'pos-glow',
        type: 'circle',
        source: 'current-pos',
        paint: { 'circle-radius': 16, 'circle-color': '#3b82f6', 'circle-opacity': 0.2 },
      });
      map.addLayer({
        id: 'pos-dot',
        type: 'circle',
        source: 'current-pos',
        paint: {
          'circle-radius': 9, 'circle-color': '#3b82f6',
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3,
        },
      });
    });

    mapRef.current = map;
    return () => {
      readyRef.current = false;
      startMarkerRef.current?.remove();
      endMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update reference route when data arrives (async query) ────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const source = map.getSource('ref-route') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (referenceRoute && referenceRoute.length >= 2) {
      source.setData(lineFeature(referenceRoute) as any);
      startMarkerRef.current?.remove();
      endMarkerRef.current?.remove();
      placeRouteMarkers(map, referenceRoute);
      fitRoute(map, referenceRoute);
    } else {
      source.setData(emptyLine() as any);
      startMarkerRef.current?.remove();
      endMarkerRef.current?.remove();
    }
  }, [referenceRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update live track ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current || track.length < 2) return;
    (mapRef.current.getSource('live-track') as maplibregl.GeoJSONSource | undefined)
      ?.setData(lineFeature(track) as any);
  }, [track]);

  // ── Update current position + next-waypoint ────────────────────────────────
  useEffect(() => {
    if (!currentPos || !mapRef.current || !readyRef.current) return;
    const map = mapRef.current;

    (map.getSource('current-pos') as maplibregl.GeoJSONSource | undefined)
      ?.setData(pointFeature(currentPos) as any);

    if (autoFollowRef.current) {
      map.panTo([currentPos.lng, currentPos.lat], { duration: 800 });
      // Rotate map to face direction of travel (course-up)
      if (heading != null) {
        map.rotateTo(heading, { duration: 600, easing: t => t });
      }
    }

    // Update next-waypoint marker
    if (referenceRoute && referenceRoute.length >= 2) {
      routeIdxRef.current = closestAheadIdx(referenceRoute, currentPos, routeIdxRef.current);
      const next = referenceRoute[routeIdxRef.current];
      (map.getSource('next-point') as maplibregl.GeoJSONSource | undefined)
        ?.setData({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [next.lng, next.lat] },
          properties: {},
        } as any);
    }
  }, [currentPos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
  );
});

export default LiveTrackingMap;

// ── Helpers ────────────────────────────────────────────────────────────────

function placeRouteMarkers(map: maplibregl.Map, route: MapPoint[]) {
  // Start — green flag
  const startEl = document.createElement('div');
  startEl.innerHTML = `<div style="width:32px;height:32px;background:#22c55e;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:14px;">▶</div>`;
  new maplibregl.Marker({ element: startEl })
    .setLngLat([route[0].lng, route[0].lat])
    .addTo(map);

  // End — red flag
  const endEl = document.createElement('div');
  endEl.innerHTML = `<div style="width:32px;height:32px;background:#ef4444;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:14px;">⬛</div>`;
  new maplibregl.Marker({ element: endEl })
    .setLngLat([route[route.length - 1].lng, route[route.length - 1].lat])
    .addTo(map);
}

function fitRoute(map: maplibregl.Map, route: MapPoint[]) {
  const bounds = route.reduce(
    (b, p) => b.extend([p.lng, p.lat] as [number, number]),
    new maplibregl.LngLatBounds(
      [route[0].lng, route[0].lat],
      [route[0].lng, route[0].lat],
    ),
  );
  map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 800 });
}

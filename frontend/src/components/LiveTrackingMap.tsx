import { useEffect, useRef, useState, memo } from 'react';
import maplibregl from 'maplibre-gl';
import { LocateFixed, Navigation2, Layers, Plus, Minus, AlertTriangle } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPoint { lat: number; lng: number; accuracy?: number; ele?: number }

interface Props {
  track: MapPoint[];
  referenceRoute?: MapPoint[];
  currentPos?: MapPoint;
  heading?: number | null;
  markerEmoji?: string;   // custom cursor (emoji); empty = default arrow
  className?: string;
}

// Cardinal direction (Spanish) from a compass bearing in degrees.
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function cardinal(deg: number): string {
  return CARDINALS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
const STYLES = {
  outdoor:   { label: 'Outdoor',  url: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}` },
  satellite: { label: 'Satélite', url: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}` },
  dark:      { label: 'Oscuro',   url: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}` },
} as const;
type StyleKey = keyof typeof STYLES;
const STYLE_ORDER: StyleKey[] = ['outdoor', 'satellite', 'dark'];

const NAV_ZOOM = 16.8;
const NAV_PITCH = 55;
const OFF_ROUTE_M = 30;

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

// ── Geo helpers ──────────────────────────────────────────────────────────────
function haversine(a: MapPoint, b: MapPoint): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const la1 = a.lat * toR, la2 = b.lat * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function bearingOf(a: MapPoint, b: MapPoint): number {
  const toR = Math.PI / 180, toD = 180 / Math.PI;
  const dLng = (b.lng - a.lng) * toR;
  const la1 = a.lat * toR, la2 = b.lat * toR;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) * toD + 360) % 360;
}

/** Closest point index on the route ahead of current position */
function closestAheadIdx(route: MapPoint[], pos: MapPoint, pastIdx: number): number {
  let minDist = Infinity, best = pastIdx;
  const search = Math.min(route.length, pastIdx + 80);
  for (let i = pastIdx; i < search; i++) {
    const dx = route[i].lng - pos.lng, dy = route[i].lat - pos.lat;
    const d = dx * dx + dy * dy;
    if (d < minDist) { minDist = d; best = i; }
  }
  return Math.min(best + 5, route.length - 1);
}

interface Guidance { offRoute: boolean; remainingKm: number; turnDist: number | null }

/** Route progress: distance to nearest point (off-route check), remaining
 *  distance along the route, and distance to the next significant turn. */
function computeGuidance(route: MapPoint[], pos: MapPoint, idx: number): Guidance {
  let nearest = Infinity;
  for (let i = Math.max(0, idx - 8); i < Math.min(route.length, idx + 8); i++) {
    nearest = Math.min(nearest, haversine(pos, route[i]));
  }
  let remaining = haversine(pos, route[idx]);
  for (let i = idx; i < route.length - 1; i++) remaining += haversine(route[i], route[i + 1]);

  let turnDist: number | null = null, acc = 0;
  for (let i = idx; i < route.length - 2 && acc < 1500; i++) {
    acc += haversine(route[i], route[i + 1]);
    let diff = Math.abs(bearingOf(route[i + 1], route[i + 2]) - bearingOf(route[i], route[i + 1]));
    if (diff > 180) diff = 360 - diff;
    if (diff > 35) { turnDist = acc; break; }
  }
  return { offRoute: nearest > OFF_ROUTE_M, remainingKm: remaining / 1000, turnDist };
}

const LiveTrackingMap = memo(function LiveTrackingMap({
  track, referenceRoute, currentPos, heading, markerEmoji = '', className = '',
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const autoFollowRef   = useRef(true);
  const readyRef        = useRef(false);
  const routeIdxRef     = useRef(0);
  const posMarkerRef    = useRef<maplibregl.Marker | null>(null);
  const startMarkerRef  = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef    = useRef<maplibregl.Marker | null>(null);
  const lastTrackDrawRef = useRef(0);
  const lastFollowRef    = useRef(0);
  const followTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest data mirrored in refs so style re-installs / camera logic can read it.
  const trackRef   = useRef(track);        trackRef.current = track;
  const routeRef   = useRef(referenceRoute); routeRef.current = referenceRoute;
  const currentPosRef = useRef(currentPos); currentPosRef.current = currentPos;
  const headingRef = useRef(heading);      headingRef.current = heading;
  const markerEmojiRef = useRef(markerEmoji); markerEmojiRef.current = markerEmoji;
  const navModeRef = useRef(true);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [following, setFollowing] = useState(true);
  const [navMode, setNavMode]     = useState(true);
  const [styleKey, setStyleKey]   = useState<StyleKey>('outdoor');
  const [guidance, setGuidance]   = useState<Guidance | null>(null);

  // ── Install our sources/layers/markers on top of the base style. Re-run after
  //    a style switch (setStyle wipes custom layers; DOM markers survive). ──────
  const installOverlays = (map: maplibregl.Map) => {
    if (map.getSource('ref-route')) return; // already installed for this style
    const route = routeRef.current;

    map.addSource('ref-route', {
      type: 'geojson',
      data: (route && route.length >= 2 ? lineFeature(route) : emptyLine()) as any,
    });
    map.addLayer({
      id: 'ref-route-casing', type: 'line', source: 'ref-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1d4ed8', 'line-width': 11, 'line-opacity': 0.35, 'line-blur': 4 },
    });
    map.addLayer({
      id: 'ref-route-line', type: 'line', source: 'ref-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#60a5fa', 'line-width': 6, 'line-opacity': 0.97 },
    });

    map.addSource('next-point', { type: 'geojson', data: emptyPoint() as any });
    map.addLayer({
      id: 'next-point-glow', type: 'circle', source: 'next-point',
      filter: ['!=', ['get', 'hidden'], true],
      paint: { 'circle-radius': 22, 'circle-color': '#60a5fa', 'circle-opacity': 0.2, 'circle-blur': 1 },
    });
    map.addLayer({
      id: 'next-point-dot', type: 'circle', source: 'next-point',
      filter: ['!=', ['get', 'hidden'], true],
      paint: { 'circle-radius': 8, 'circle-color': '#93c5fd', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    });

    map.addSource('live-track', {
      type: 'geojson',
      data: (trackRef.current.length >= 2 ? lineFeature(trackRef.current) : emptyLine()) as any,
    });
    map.addLayer({
      id: 'live-track-casing', type: 'line', source: 'live-track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#14532d', 'line-width': 11, 'line-opacity': 0.45 },
    });
    map.addLayer({
      id: 'live-track-line', type: 'line', source: 'live-track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#22c55e', 'line-width': 6, 'line-opacity': 1 },
    });

    const t = trackRef.current;
    const pos = currentPosRef.current ?? (t.length ? t[t.length - 1] : null);
    map.addSource('current-pos', {
      type: 'geojson',
      data: (pos ? pointFeature(pos) : emptyPoint()) as any,
    });
    map.addLayer({
      id: 'pos-accuracy', type: 'circle', source: 'current-pos',
      paint: { 'circle-radius': 28, 'circle-color': '#3b82f6', 'circle-opacity': 0.1 },
    });

    // Start/end flags + position marker are DOM markers → add once, they survive
    // style switches.
    if (route && route.length >= 2 && !startMarkerRef.current) {
      const { start, end } = makeRouteMarkers(route);
      startMarkerRef.current = start.addTo(map);
      endMarkerRef.current   = end.addTo(map);
    }
    if (pos && !posMarkerRef.current) {
      posMarkerRef.current = createPosMarker(map, pos, markerEmojiRef.current);
    }
  };

  const recenter = () => {
    autoFollowRef.current = true;
    setFollowing(true);
    const map = mapRef.current, pos = currentPosRef.current;
    if (map && pos) {
      map.easeTo({
        center: [pos.lng, pos.lat],
        bearing: navModeRef.current ? (headingRef.current ?? map.getBearing()) : 0,
        pitch: navModeRef.current ? NAV_PITCH : 0,
        zoom: navModeRef.current ? NAV_ZOOM : map.getZoom(),
        duration: 500,
      });
    }
  };

  const toggleNav = () => {
    const on = !navMode;
    setNavMode(on); navModeRef.current = on;
    autoFollowRef.current = true; setFollowing(true);
    const map = mapRef.current, pos = currentPosRef.current;
    if (!map) return;
    map.easeTo({
      center: pos ? [pos.lng, pos.lat] : map.getCenter(),
      bearing: on ? (headingRef.current ?? 0) : 0,
      pitch: on ? NAV_PITCH : 0,
      zoom: on ? NAV_ZOOM : Math.min(map.getZoom(), 15.5),
      duration: 600,
    });
  };

  const cycleStyle = () => {
    const next = STYLE_ORDER[(STYLE_ORDER.indexOf(styleKey) + 1) % STYLE_ORDER.length];
    setStyleKey(next);
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLES[next].url);
    map.once('styledata', () => installOverlays(map));
  };

  const zoomBy = (d: number) => mapRef.current?.easeTo({ zoom: (mapRef.current.getZoom() ?? 15) + d, duration: 250 });

  // ── Map init (once) ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const startCenter: [number, number] =
      referenceRoute?.length ? [referenceRoute[0].lng, referenceRoute[0].lat]
      : currentPos ? [currentPos.lng, currentPos.lat]
      : [-99.133, 19.432];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLES.outdoor.url,
      center: startCenter,
      zoom: NAV_ZOOM,
      pitch: NAV_PITCH,
      attributionControl: false,
      pitchWithRotate: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    // Panning temporarily disables follow; re-enable a few seconds after release.
    map.on('dragstart', () => {
      autoFollowRef.current = false; setFollowing(false);
      if (followTimerRef.current) clearTimeout(followTimerRef.current);
    });
    map.on('dragend', () => {
      if (followTimerRef.current) clearTimeout(followTimerRef.current);
      followTimerRef.current = setTimeout(recenter, 5000);
    });

    map.on('load', () => {
      readyRef.current = true;
      setMapLoaded(true);
      installOverlays(map);
      if (routeRef.current && routeRef.current.length >= 2) fitRoute(map, routeRef.current);
    });

    mapRef.current = map;
    return () => {
      readyRef.current = false;
      if (followTimerRef.current) clearTimeout(followTimerRef.current);
      posMarkerRef.current?.remove();
      startMarkerRef.current?.remove();
      endMarkerRef.current?.remove();
      posMarkerRef.current = startMarkerRef.current = endMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reference route arrives (async) ────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const source = map.getSource('ref-route') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    if (referenceRoute && referenceRoute.length >= 2) {
      source.setData(lineFeature(referenceRoute) as any);
      startMarkerRef.current?.remove(); endMarkerRef.current?.remove();
      const { start, end } = makeRouteMarkers(referenceRoute);
      startMarkerRef.current = start.addTo(map);
      endMarkerRef.current   = end.addTo(map);
      if (!navMode) fitRoute(map, referenceRoute);
    } else {
      source.setData(emptyLine() as any);
      startMarkerRef.current?.remove(); endMarkerRef.current?.remove();
      startMarkerRef.current = endMarkerRef.current = null;
    }
  }, [referenceRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live track (throttled redraw) ──────────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !mapRef.current || track.length < 2) return;
    const now = Date.now();
    if (now - lastTrackDrawRef.current < 1000) return;
    lastTrackDrawRef.current = now;
    (mapRef.current.getSource('live-track') as maplibregl.GeoJSONSource | undefined)
      ?.setData(lineFeature(track) as any);
  }, [track]);

  // ── Current position + camera + route guidance ─────────────────────────────
  useEffect(() => {
    if (!currentPos || !mapRef.current || !readyRef.current) return;
    const map = mapRef.current;

    (map.getSource('current-pos') as maplibregl.GeoJSONSource | undefined)
      ?.setData(pointFeature(currentPos) as any);

    if (!posMarkerRef.current) {
      posMarkerRef.current = createPosMarker(map, currentPos, markerEmojiRef.current);
    }
    posMarkerRef.current.setLngLat([currentPos.lng, currentPos.lat]);
    // Only the arrow cursor rotates; emoji cursors stay upright (direction shown
    // by the rotating map + compass badge).
    if (!markerEmojiRef.current) {
      const el = posMarkerRef.current.getElement();
      const beam = el.querySelector('.jtz-beam') as HTMLElement | null;
      const arrow = el.querySelector('.jtz-arrow') as HTMLElement | null;
      if (heading != null) {
        posMarkerRef.current.setRotation(heading);
        if (beam) beam.style.opacity = '1';
        if (arrow) arrow.style.opacity = '1';
      } else {
        if (beam) beam.style.opacity = '0';
        if (arrow) arrow.style.opacity = '0';
      }
    }

    // Camera follow (throttled). Nav mode rotates the map to the heading + tilts.
    if (autoFollowRef.current) {
      const now = Date.now();
      const c = map.getCenter();
      const far = Math.abs(c.lng - currentPos.lng) > 0.004 || Math.abs(c.lat - currentPos.lat) > 0.004;
      if (far || now - lastFollowRef.current > 700) {
        const opts: maplibregl.EaseToOptions = { center: [currentPos.lng, currentPos.lat], duration: far ? 0 : 600 };
        if (navModeRef.current && heading != null) { opts.bearing = heading; opts.pitch = NAV_PITCH; }
        map.easeTo(opts);
        lastFollowRef.current = now;
      }
    }

    // Route guidance (next-point marker + HUD)
    if (referenceRoute && referenceRoute.length >= 2) {
      routeIdxRef.current = closestAheadIdx(referenceRoute, currentPos, routeIdxRef.current);
      const next = referenceRoute[routeIdxRef.current];
      (map.getSource('next-point') as maplibregl.GeoJSONSource | undefined)
        ?.setData(pointFeature(next) as any);
      setGuidance(computeGuidance(referenceRoute, currentPos, routeIdxRef.current));
    }
  }, [currentPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recreate the position marker when the chosen cursor (emoji) changes.
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    posMarkerRef.current?.remove();
    posMarkerRef.current = null;
    const t = trackRef.current;
    const pos = currentPosRef.current ?? (t.length ? t[t.length - 1] : null);
    if (pos) posMarkerRef.current = createPosMarker(mapRef.current, pos, markerEmoji);
  }, [markerEmoji]);

  const btn: React.CSSProperties = {
    width: 52, height: 52, borderRadius: 16, border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(17,19,21,0.92)', color: '#e5e7eb', display: 'flex',
    alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
  };

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', background: '#0f1115' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Compass — cardinal direction of travel */}
      {mapLoaded && heading != null && (
        <div style={{
          position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 12, background: 'rgba(17,19,21,0.9)',
          border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)',
          color: '#fff', fontWeight: 700, fontSize: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        }}>
          <span style={{ display: 'inline-block', transform: `rotate(${heading}deg)`, color: '#3b82f6', fontSize: 15 }}>↑</span>
          {cardinal(heading)} <span style={{ color: '#9ca3af', fontWeight: 500 }}>{Math.round(heading)}°</span>
        </div>
      )}

      {!mapLoaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, background: '#0f1115', color: '#9ca3af' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #22c55e', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 13 }}>Cargando mapa…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ── Route guidance HUD (only with a reference route) ── */}
      {mapLoaded && guidance && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          maxWidth: '90%', padding: '8px 16px', borderRadius: 14,
          background: guidance.offRoute ? 'rgba(220,38,38,0.95)' : 'rgba(17,19,21,0.92)',
          border: `1px solid ${guidance.offRoute ? '#fca5a5' : 'rgba(255,255,255,0.14)'}`,
          color: '#fff', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 2px 14px rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
          {guidance.offRoute ? (
            <><AlertTriangle size={16} /> <span style={{ fontWeight: 700, fontSize: 14 }}>Fuera de ruta — vuelve al camino</span></>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              🏁 Faltan {guidance.remainingKm.toFixed(2)} km
              {guidance.turnDist != null && (
                <span style={{ color: '#93c5fd' }}>{'  ·  '}Vuelta en {Math.round(guidance.turnDist)} m</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* ── Controls (big, touch-friendly) ── */}
      {mapLoaded && (
        <div style={{ position: 'absolute', right: 12, bottom: 96, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={toggleNav} aria-label="Modo navegación"
            style={{ ...btn, color: navMode ? '#22c55e' : '#e5e7eb',
              borderColor: navMode ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.14)' }}>
            <Navigation2 size={24} style={{ fill: navMode ? '#22c55e' : 'none' }} />
          </button>
          <button onClick={cycleStyle} aria-label={`Estilo: ${STYLES[styleKey].label}`} style={btn}>
            <Layers size={22} />
          </button>
          <button onClick={() => zoomBy(1)} aria-label="Acercar" style={btn}><Plus size={24} /></button>
          <button onClick={() => zoomBy(-1)} aria-label="Alejar" style={btn}><Minus size={24} /></button>
          {!following && (
            <button onClick={recenter} aria-label="Centrar en mi posición" style={{ ...btn, color: '#3b82f6' }}>
              <LocateFixed size={24} />
            </button>
          )}
        </div>
      )}

      {/* Style name flash */}
      {mapLoaded && (
        <div style={{ position: 'absolute', left: 12, bottom: 96, padding: '6px 12px', borderRadius: 12,
          background: 'rgba(17,19,21,0.85)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af',
          fontSize: 12, fontWeight: 600, backdropFilter: 'blur(6px)' }}>
          {STYLES[styleKey].label}
        </div>
      )}
    </div>
  );
});

export default LiveTrackingMap;

// ── Marker helpers ───────────────────────────────────────────────────────────

// Position marker. Arrow cursor rotates with the map; emoji cursors stay upright.
function createPosMarker(map: maplibregl.Map, pos: MapPoint, emoji: string): maplibregl.Marker {
  return new maplibregl.Marker({
    element: makeHeadingEl(emoji),
    rotationAlignment: emoji ? 'viewport' : 'map',
  }).setLngLat([pos.lng, pos.lat]).addTo(map);
}

function makeHeadingEl(emoji: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '0'; el.style.height = '0';
  if (emoji) {
    el.innerHTML = `
      <div style="position:relative;width:0;height:0;">
        <div style="position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;
          background:rgba(59,130,246,0.18);"></div>
        <div style="position:absolute;left:-19px;top:-19px;width:38px;height:38px;display:flex;
          align-items:center;justify-content:center;font-size:30px;line-height:1;
          filter:drop-shadow(0 1px 3px rgba(0,0,0,.65));">${emoji}</div>
      </div>`;
    return el;
  }
  el.innerHTML = `
    <div style="position:relative;width:0;height:0;">
      <div class="jtz-beam" style="
        position:absolute;left:-19px;top:-42px;width:38px;height:42px;opacity:0;
        background:linear-gradient(to top, rgba(59,130,246,0.5), rgba(59,130,246,0));
        clip-path:polygon(50% 0, 100% 100%, 0 100%);
        transition:opacity .3s ease;pointer-events:none;"></div>
      <!-- Solid direction arrow (chevron) pointing where you're heading -->
      <div class="jtz-arrow" style="
        position:absolute;left:-9px;top:-26px;width:18px;height:16px;opacity:0;
        background:#3b82f6;clip-path:polygon(50% 0, 100% 100%, 50% 78%, 0 100%);
        filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));transition:opacity .3s ease;pointer-events:none;"></div>
      <div style="
        position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;
        background:#3b82f6;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5);"></div>
    </div>`;
  return el;
}

function makeRouteMarkers(route: MapPoint[]): { start: maplibregl.Marker; end: maplibregl.Marker } {
  const startEl = document.createElement('div');
  startEl.innerHTML = `<div style="width:32px;height:32px;background:#22c55e;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:14px;">▶</div>`;
  const endEl = document.createElement('div');
  endEl.innerHTML = `<div style="width:32px;height:32px;background:#ef4444;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:14px;">⬛</div>`;
  return {
    start: new maplibregl.Marker({ element: startEl }).setLngLat([route[0].lng, route[0].lat]),
    end:   new maplibregl.Marker({ element: endEl }).setLngLat([route[route.length - 1].lng, route[route.length - 1].lat]),
  };
}

function fitRoute(map: maplibregl.Map, route: MapPoint[]) {
  const bounds = route.reduce(
    (b, p) => b.extend([p.lng, p.lat] as [number, number]),
    new maplibregl.LngLatBounds([route[0].lng, route[0].lat], [route[0].lng, route[0].lat]),
  );
  map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 800 });
}

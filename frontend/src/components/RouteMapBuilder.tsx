import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, RotateCcw, Check, Loader2, MapPin, Navigation2, Locate } from 'lucide-react';

export interface BuiltRoute {
  coordinates: [number, number][];
  distanceKm: number;
  gpxContent: string;
}

interface Props {
  tipoActividad: string;
  onConfirm: (route: BuiltRoute) => void;
  onCancel: () => void;
}

type BuildStep = 'idle' | 'routing' | 'done' | 'error';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
const STYLE_URL    = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

interface Suggestion { id: string; label: string; sublabel?: string; center: [number, number]; isCurrent?: boolean; dist?: number }
interface Endpoint   { label: string; center: [number, number] | null }

function coordsToGpx(coords: [number, number][], name: string): string {
  const pts = coords
    .map(([lng, lat]) => `    <trkpt lat="${lat}" lon="${lng}"><time>${new Date().toISOString()}</time></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="JTZ Running Club">
  <trk><name>${name}</name><trkseg>\n${pts}\n  </trkseg></trk>
</gpx>`;
}

function makeMarkerEl(label: string, color: string) {
  const el = document.createElement('div');
  el.style.cssText = `width:30px;height:30px;background:${color};border:2.5px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.45);color:#fff;font-weight:700;font-size:13px;`;
  el.textContent = label;
  return el;
}

// ── Geocoding helpers ───────────────────────────────────────────────────────

function geoDistKm(a: [number, number], b: [number, number]): number {
  const dx = (a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180) * 111.32;
  const dy = (a[1] - b[1]) * 111.32;
  return Math.sqrt(dx * dx + dy * dy);
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// ── MapTiler — good for POIs / business names ───────────────────────────────
type MTFeature = {
  id: string; text?: string; place_name?: string;
  center: [number, number];
  context?: Array<{ id: string; text: string }>;
};

async function geocodeMaptiler(query: string, proximity: [number, number] | null): Promise<Suggestion[]> {
  const hasNum = /\d/.test(query);
  const params: Record<string, string> = {
    key: MAPTILER_KEY, language: 'es', limit: '5',
    types: 'poi,address,road,place,neighbourhood,locality',
  };
  if (proximity) {
    const [lng, lat] = proximity;
    params.proximity = `${lng},${lat}`;
    // Wider bbox for address queries so the geocoder can interpolate the block
    const d = hasNum ? 0.2 : 0.05;
    params.bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  } else {
    params.bbox = '-118.6,14.5,-86.7,32.7';
  }
  const tryFetch = async (p: Record<string, string>): Promise<MTFeature[]> => {
    const res  = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${new URLSearchParams(p)}`);
    const data = await res.json();
    return data.features ?? [];
  };
  try {
    let feats = await tryFetch(params);
    if (feats.length === 0 && proximity) {
      const [lng, lat] = proximity;
      feats = await tryFetch({ ...params, bbox: `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}` });
    }
    if (feats.length === 0) feats = await tryFetch({ ...params, bbox: '-118.6,14.5,-86.7,32.7' });
    return feats.map(f => {
      const label = (f.text ?? f.place_name?.split(',')[0] ?? '').trim();
      const ctx   = f.context ?? [];
      const nbhd  = ctx.find(c => /^neighbourhood|^locality/.test(c.id))?.text;
      const city  = ctx.find(c => /^place|^municipality/.test(c.id))?.text;
      const rgn   = ctx.find(c => /^region/.test(c.id))?.text;
      const pparts = (f.place_name ?? '').split(',');
      const addr   = pparts.slice(1, pparts.length > 2 ? -1 : undefined).map(s => s.trim()).filter(Boolean).join(', ');
      return {
        id: `mt-${f.id}`, label,
        sublabel: addr || [nbhd, city || rgn].filter(Boolean).join(', ') || undefined,
        center: f.center,
      };
    });
  } catch { return []; }
}

// ── Nominatim — structured house-number search via OSM ─────────────────────
type NominatimResult = {
  place_id: number; display_name: string; lat: string; lon: string;
  address?: {
    house_number?: string; road?: string; pedestrian?: string;
    neighbourhood?: string; suburb?: string;
    city?: string; town?: string; village?: string; state?: string;
  };
};

async function geocodeNominatim(query: string, proximity: [number, number] | null): Promise<Suggestion[]> {
  // Detect "street name + number" or "number + street name"
  const endNum   = query.match(/^(.+?)\s+(\d+)\s*$/);  // "calle tercera 1620"
  const startNum = query.match(/^(\d+)\s+(.+)\s*$/);   // "1620 calle tercera"
  if (!endNum && !startNum) return [];                  // only run for address+number queries

  const num    = endNum ? endNum[2] : startNum![1];
  const street = endNum ? endNum[1] : startNum![2];

  const params: Record<string, string> = {
    format: 'jsonv2', addressdetails: '1', 'accept-language': 'es',
    limit: '5', countrycodes: 'mx',
    street: `${num} ${street}`,  // Nominatim prefers "number streetname"
  };
  if (proximity) {
    const [lng, lat] = proximity;
    // viewbox: left,top,right,bottom (west,north,east,south)
    params.viewbox = `${lng - 0.3},${lat + 0.3},${lng + 0.3},${lat - 0.3}`;
    params.bounded = '0';
  }
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`,
      { headers: { 'User-Agent': 'JTZ-RunningClub/1.0' } },
    );
    const data: NominatimResult[] = await res.json();
    return data
      .filter(f => !proximity || geoDistKm([parseFloat(f.lon), parseFloat(f.lat)], proximity) < 50)
      .map(f => {
        const addr  = f.address ?? {};
        const hnum  = addr.house_number;
        const road  = addr.road ?? addr.pedestrian;
        const label = hnum && road ? `${road} ${hnum}` : (road ?? f.display_name.split(',')[0].trim());
        const sub   = [
          addr.neighbourhood ?? addr.suburb,
          addr.city ?? addr.town ?? addr.village,
        ].filter(Boolean).join(', ');
        return {
          id: `nm-${f.place_id}`, label,
          sublabel: sub || undefined,
          center: [parseFloat(f.lon), parseFloat(f.lat)] as [number, number],
        };
      });
  } catch { return []; }
}

// ── Photon — OSM-based, good location bias ──────────────────────────────────
type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number; name?: string; street?: string; housenumber?: string;
    city?: string; county?: string; state?: string;
  };
};

async function geocodePhoton(query: string, proximity: [number, number] | null): Promise<Suggestion[]> {
  const params: Record<string, string> = { q: query, limit: '5', lang: 'es' };
  if (proximity) {
    params.lat = String(proximity[1]); params.lon = String(proximity[0]);
    // Tight bbox ~10km so only local results
    const d = 0.1;
    params.bbox = `${proximity[0] - d},${proximity[1] - d},${proximity[0] + d},${proximity[1] + d}`;
  }
  try {
    const res  = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams(params)}`);
    const data = await res.json();
    const feats: PhotonFeature[] = data.features ?? [];
    return feats
      .filter(f => !proximity || geoDistKm(f.geometry.coordinates, proximity) < 50)
      .map(f => {
        const p = f.properties;
        const label = p.housenumber
          ? `${p.name ?? p.street ?? ''} ${p.housenumber}`.trim()
          : (p.name ?? p.street ?? '').trim();
        const sublabel = [p.city ?? p.county, p.state].filter(Boolean).join(', ') || undefined;
        return {
          id: `ph-${p.osm_id ?? Math.random()}`,
          label: label || (p.city ?? query),
          sublabel,
          center: f.geometry.coordinates,
        };
      })
      .filter(s => s.label.length > 0);
  } catch { return []; }
}

// ── Merged: run all three in parallel, dedup by coords, sort by distance ────
async function geocode(query: string, proximity: [number, number] | null): Promise<Suggestion[]> {
  if (query.trim().length < 2) return [];
  const [mt, nm, ph] = await Promise.all([
    geocodeMaptiler(query, proximity),
    geocodeNominatim(query, proximity),
    geocodePhoton(query, proximity),
  ]);
  const seen   = new Set<string>();
  const merged: Suggestion[] = [];
  const add = (s: Suggestion) => {
    const key = `${Math.round(s.center[0] * 1000)},${Math.round(s.center[1] * 1000)}`;
    if (!seen.has(key)) { seen.add(key); merged.push(s); }
  };
  // Nominatim + Photon address results (with house numbers) go first
  [...nm, ...ph].filter(s => /\d/.test(s.label)).forEach(add);
  // MapTiler POI / place results
  mt.forEach(add);
  // Remaining street-only results
  [...nm, ...ph].filter(s => !/\d/.test(s.label)).forEach(add);

  // Annotate with distance and sort nearest-first
  return merged
    .slice(0, 7)
    .map(s => ({ ...s, dist: proximity ? geoDistKm(s.center, proximity) : undefined }))
    .sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999))
    .slice(0, 6);
}

async function reverseGeocode(center: [number, number]): Promise<string> {
  try {
    const res  = await fetch(`https://api.maptiler.com/geocoding/${center[0]},${center[1]}.json?key=${MAPTILER_KEY}&language=es&limit=1`);
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) return 'Mi ubicación actual';
    const parts = ((feat.place_name ?? feat.text) as string).split(',');
    return parts[0].trim();
  } catch { return 'Mi ubicación actual'; }
}

// ── Compact search input ────────────────────────────────────────────────────
function SearchInput({
  which, value, suggestions, loading, showCurrentLocation,
  onChange, onSelect, onFocus, onBlur,
}: {
  which: 'A' | 'B';
  value: string;
  suggestions: Suggestion[];
  loading: boolean;
  showCurrentLocation: boolean;
  onChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isA = which === 'A';

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isA ? 'bg-green-400' : 'bg-red-400'}`}
          style={{ boxShadow: isA ? '0 0 6px #4ade80' : '0 0 6px #f87171' }}
        />
        <input
          value={value}
          placeholder={isA ? 'Punto de inicio' : 'Destino'}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); onFocus(); }}
          onBlur={() => { setTimeout(() => { setOpen(false); onBlur(); }, 160); }}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-w-0"
        />
        {loading
          ? <Loader2 size={13} className="text-gray-500 animate-spin flex-shrink-0" />
          : value
            ? <button onMouseDown={() => onChange('')} className="text-gray-500 hover:text-white flex-shrink-0"><X size={13} /></button>
            : null}
      </div>

      {/* Dropdown */}
      {open && (suggestions.length > 0 || showCurrentLocation) && (
        <div className="absolute left-0 right-0 top-full bg-dark-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden mt-0.5" style={{ zIndex: 10 }}>

          {/* Current location option (A only) */}
          {isA && showCurrentLocation && (
            <button
              onMouseDown={() => { onSelect({ id: '__current__', label: 'Mi ubicación actual', center: [0, 0], isCurrent: true }); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-dark-700 transition-colors border-b border-white/5"
            >
              <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Locate size={13} className="text-blue-400" />
              </div>
              <div className="text-left">
                <div className="text-sm text-blue-300 font-medium">Mi ubicación actual</div>
                <div className="text-[11px] text-gray-500">Usar posición GPS</div>
              </div>
            </button>
          )}

          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onMouseDown={() => { onSelect(s); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-dark-700 transition-colors text-left ${i < suggestions.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
            >
              <div className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                <MapPin size={12} className="text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{s.label}</div>
                {s.sublabel && <div className="text-[11px] text-gray-500 truncate">{s.sublabel}</div>}
              </div>
              {s.dist != null && (
                <div className="text-[11px] text-gray-500 flex-shrink-0 ml-1">{fmtDist(s.dist)}</div>
              )}
            </button>
          ))}

          <button
            onMouseDown={() => { onChange(''); setOpen(false); onSelect({ id: '__map__', label: '', center: [0, 0] }); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-dark-700 transition-colors border-t border-white/5"
          >
            <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
              <Navigation2 size={12} className="text-brand-400" />
            </div>
            <div className="text-sm text-brand-400">Seleccionar en el mapa</div>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function RouteMapBuilder({ tipoActividad, onConfirm, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const markerA      = useRef<maplibregl.Marker | null>(null);
  const markerB      = useRef<maplibregl.Marker | null>(null);
  const proximityRef = useRef<[number, number] | null>(null);
  const clickModeRef = useRef<'A' | 'B' | null>(null);

  const [clickMode, setClickMode]   = useState<'A' | 'B' | null>(null);
  const [endpointA, setEndpointA]   = useState<Endpoint>({ label: '', center: null });
  const [endpointB, setEndpointB]   = useState<Endpoint>({ label: '', center: null });
  const [sugA, setSugA]             = useState<Suggestion[]>([]);
  const [sugB, setSugB]             = useState<Suggestion[]>([]);
  const [loadA, setLoadA]           = useState(false);
  const [loadB, setLoadB]           = useState(false);
  const [focusedField, setFocused]  = useState<'A' | 'B' | null>(null);
  const debounceA                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceB                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [step, setStep]             = useState<BuildStep>('idle');
  const [result, setResult]         = useState<BuiltRoute | null>(null);
  const [distKm, setDistKm]         = useState<number | null>(null);

  const profile = tipoActividad === 'ciclismo' ? 'bike' : 'foot';

  const search = (which: 'A' | 'B', q: string) => {
    const setEp  = which === 'A' ? setEndpointA : setEndpointB;
    const setSug = which === 'A' ? setSugA : setSugB;
    const setLd  = which === 'A' ? setLoadA : setLoadB;
    const deb    = which === 'A' ? debounceA : debounceB;
    setEp(p => ({ ...p, label: q, center: null }));
    if (deb.current) clearTimeout(deb.current);
    if (q.length < 2) { setSug([]); return; }
    setLd(true);
    deb.current = setTimeout(async () => {
      const res = await geocode(q, proximityRef.current);
      setSug(res); setLd(false);
    }, 360);
  };

  const placeA = useCallback((center: [number, number], label: string) => {
    setEndpointA({ label, center });
    setSugA([]);
    markerA.current?.remove();
    markerA.current = new maplibregl.Marker({ element: makeMarkerEl('A', '#22c55e') })
      .setLngLat(center).addTo(mapRef.current!);
    mapRef.current?.flyTo({ center, zoom: 15, duration: 700 });
  }, []);

  const placeB = useCallback((center: [number, number], label: string) => {
    setEndpointB({ label, center });
    setSugB([]);
    markerB.current?.remove();
    markerB.current = new maplibregl.Marker({ element: makeMarkerEl('B', '#ef4444') })
      .setLngLat(center).addTo(mapRef.current!);
    mapRef.current?.flyTo({ center, zoom: 15, duration: 700 });
  }, []);

  const handleSelectA = useCallback(async (s: Suggestion) => {
    if (s.id === '__map__') { clickModeRef.current = 'A'; setClickMode('A'); return; }
    if (s.isCurrent) {
      // Request GPS on-demand — works even if proximityRef not yet set
      setEndpointA(p => ({ ...p, label: 'Obteniendo ubicación…' }));
      navigator.geolocation?.getCurrentPosition(
        async pos => {
          const center: [number, number] = [pos.coords.longitude, pos.coords.latitude];
          proximityRef.current = center;
          const label = await reverseGeocode(center);
          placeA(center, label);
        },
        () => setEndpointA(p => ({ ...p, label: '' })),
        { enableHighAccuracy: true, timeout: 10000 },
      );
      return;
    }
    placeA(s.center, s.label);
  }, [placeA]);

  const handleSelectB = useCallback((s: Suggestion) => {
    if (s.id === '__map__') { clickModeRef.current = 'B'; setClickMode('B'); return; }
    placeB(s.center, s.label);
  }, [placeB]);

  const calcRoute = useCallback(async (a: [number, number], b: [number, number]) => {
    setStep('routing');
    try {
      const url =
        `https://router.project-osrm.org/route/v1/${profile}/${a[0]},${a[1]};${b[0]},${b[1]}` +
        `?geometries=geojson&overview=full&steps=false`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error();
      const route  = data.routes[0];
      const coords: [number, number][] = route.geometry.coordinates;
      const km = parseFloat((route.distance / 1000).toFixed(2));
      (mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)
        ?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } as any);
      if (mapRef.current && coords.length > 1) {
        const bounds = coords.reduce((b, c) => b.extend(c as [number, number]), new maplibregl.LngLatBounds(coords[0], coords[0]));
        mapRef.current.fitBounds(bounds, { padding: 90, maxZoom: 17, duration: 800 });
      }
      setDistKm(km);
      setResult({ coordinates: coords, distanceKm: km, gpxContent: coordsToGpx(coords, 'Ruta trazada') });
      setStep('done');
    } catch { setStep('error'); }
  }, [profile]);

  useEffect(() => {
    if (endpointA.center && endpointB.center) calcRoute(endpointA.center, endpointB.center);
  }, [endpointA.center, endpointB.center, calcRoute]);

  const reset = useCallback(() => {
    markerA.current?.remove(); markerA.current = null;
    markerB.current?.remove(); markerB.current = null;
    setEndpointA({ label: '', center: null }); setEndpointB({ label: '', center: null });
    setSugA([]); setSugB([]);
    setStep('idle'); setResult(null); setDistKm(null);
    clickModeRef.current = null; setClickMode(null);
    (mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current, style: STYLE_URL,
      center: [-99.133, 19.432], zoom: 13, attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    navigator.geolocation?.getCurrentPosition(
      pos => {
        proximityRef.current = [pos.coords.longitude, pos.coords.latitude];
        mapRef.current?.setCenter([pos.coords.longitude, pos.coords.latitude]);
      },
      () => {}, { timeout: 8000, maximumAge: 60000 },
    );
    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any });
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1d4ed8', 'line-width': 10, 'line-opacity': 0.3 } });
      map.addLayer({ id: 'route-line',   type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#60a5fa', 'line-width': 5,  'line-opacity': 0.95 } });
    });
    map.on('click', async e => {
      const mode = clickModeRef.current;
      if (!mode) return;
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const label = await reverseGeocode(lngLat);
      if (mode === 'A') placeA(lngLat, label);
      else              placeB(lngLat, label);
      clickModeRef.current = null; setClickMode(null);
    });
    mapRef.current = map;
    return () => { markerA.current?.remove(); markerB.current?.remove(); map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = clickMode ? 'crosshair' : '';
  }, [clickMode]);

  const statusColor = step === 'error' ? 'text-red-400' : step === 'done' ? 'text-green-400' : 'text-gray-400';
  const statusText  = step === 'routing' ? 'Calculando ruta…'
    : step === 'done'    ? `✓ Ruta lista · ${distKm} km`
    : step === 'error'   ? 'No se encontró ruta entre esos puntos'
    : clickMode          ? `Toca el mapa para colocar el punto ${clickMode}`
    : !endpointA.center  ? 'Busca el punto de inicio o toca el mapa'
    : !endpointB.center  ? 'Ahora busca el destino o toca el mapa'
    : 'Calculando…';

  return createPortal(
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 9999, background: '#0f1117' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2 flex-shrink-0">
        <button onClick={onCancel}
          className="w-8 h-8 rounded-full bg-dark-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-700 transition-colors flex-shrink-0">
          <X size={16} />
        </button>

        {/* Search card */}
        <div className="flex-1 bg-dark-800 rounded-2xl border border-white/8 overflow-visible shadow-lg">
          {/* Row A */}
          <SearchInput
            which="A"
            value={endpointA.label}
            suggestions={sugA}
            loading={loadA}
            showCurrentLocation={focusedField === 'A'}
            onChange={q => search('A', q)}
            onSelect={handleSelectA}
            onFocus={() => setFocused('A')}
            onBlur={() => setFocused(null)}
          />

          {/* Connector */}
          <div className="flex items-center px-3">
            <div className="flex flex-col items-center gap-0.5 mr-2.5">
              <div className="w-px h-1 bg-dark-600" />
              <div className="w-px h-1 bg-dark-600" />
            </div>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Row B */}
          <SearchInput
            which="B"
            value={endpointB.label}
            suggestions={sugB}
            loading={loadB}
            showCurrentLocation={false}
            onChange={q => search('B', q)}
            onSelect={handleSelectB}
            onFocus={() => setFocused('B')}
            onBlur={() => setFocused(null)}
          />
        </div>

        <button onClick={reset}
          className="w-8 h-8 rounded-full bg-dark-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-700 transition-colors flex-shrink-0">
          <RotateCcw size={15} />
        </button>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs flex-shrink-0 ${statusColor}`}>
        {step === 'routing' && <Loader2 size={11} className="animate-spin" />}
        {statusText}
      </div>

      {/* ── Map ────────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* ── Bottom actions ──────────────────────────────────────────────── */}
      {(step === 'done' || step === 'error') && (
        <div className="px-4 py-3 flex gap-2.5 flex-shrink-0" style={{ background: '#0f1117' }}>
          <button onClick={reset}
            className="flex-1 py-2.5 rounded-xl border border-dark-600 text-gray-300 hover:text-white text-sm font-medium transition-colors">
            Reiniciar
          </button>
          {step === 'done' && result && (
            <button onClick={() => onConfirm(result)}
              className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors">
              <Check size={15} /> Usar ruta
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

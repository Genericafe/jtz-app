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

const MAPTILER_KEY  = import.meta.env.VITE_MAPTILER_KEY  ?? '';
const GEOAPIFY_KEY  = import.meta.env.VITE_GEOAPIFY_KEY  ?? '';
const STYLE_URL     = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

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

// Safe escape for Overpass QL regex strings
const escOv = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// ── Overpass API — radius search in OSM, best for local POIs + addresses ───
type OvElement = {
  id: number; type: string;
  lat?: number; lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function geocodeOverpass(query: string, proximity: [number, number]): Promise<Suggestion[]> {
  const [lng, lat] = proximity;
  const R  = 3000; // 3 km radius

  // Detect "street name + number" or "number + street name"
  const endNum   = query.match(/^(.+?)\s+(\d+)\s*$/);
  const startNum = query.match(/^(\d+)\s+(.+)\s*$/);

  let ql: string;
  if (endNum || startNum) {
    const street = endNum ? endNum[1] : startNum![2];
    const hnum   = endNum ? endNum[2] : startNum![1];
    const sEsc   = escOv(street);
    ql = `[out:json][timeout:8];
(
  node(around:${R},${lat},${lng})["addr:street"~"${sEsc}",i]["addr:housenumber"="${hnum}"];
  way(around:${R},${lat},${lng})["addr:street"~"${sEsc}",i]["addr:housenumber"="${hnum}"];
  way(around:${R},${lat},${lng})[highway][name~"${sEsc}",i];
  node(around:${R},${lat},${lng})[name~"${sEsc}",i];
);
out center 8;`;
  } else {
    const qEsc = escOv(query);
    ql = `[out:json][timeout:8];
(
  node(around:${R},${lat},${lng})[name~"${qEsc}",i];
  way(around:${R},${lat},${lng})[name~"${qEsc}",i];
);
out center 8;`;
  }

  try {
    const res  = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(ql)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await res.json();
    const els: OvElement[] = data.elements ?? [];

    const results: Suggestion[] = [];
    for (const el of els) {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (!elLat || !elLng) continue;
      const tags    = el.tags ?? {};
      const addrStr = tags['addr:street'];
      const addrNum = tags['addr:housenumber'];
      const name    = tags.name ?? tags['name:es'];
      const label   = addrStr && addrNum ? `${addrStr} ${addrNum}` : (name ?? '');
      if (!label) continue;
      const suburb   = tags['addr:suburb'] ?? tags['addr:neighbourhood'] ?? tags['addr:colonia'];
      const city     = tags['addr:city'];
      const typeTag  = tags.amenity ?? tags.shop ?? tags.leisure ?? tags.tourism;
      const sublabel: string | undefined = suburb && city
        ? `${suburb}, ${city}`
        : city ?? (typeTag ? typeTag.replace(/_/g, ' ') : undefined);
      results.push({ id: `ov-${el.id}`, label, sublabel, center: [elLng, elLat] });
    }
    return results;
  } catch { return []; }
}

// ── MapTiler — global POI / city / place names ──────────────────────────────
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
      // Skip purely numeric locality/neighbourhood entries — those are postal codes
      const nbhd  = ctx.find(c => /^neighbourhood|^locality/.test(c.id) && !/^\d+$/.test(c.text))?.text;
      const city  = ctx.find(c => /^place|^municipality/.test(c.id) && !/^\d+$/.test(c.text))?.text;
      const rgn   = ctx.find(c => /^region/.test(c.id))?.text;
      return {
        id: `mt-${f.id}`, label,
        sublabel: [nbhd, city || rgn].filter(Boolean).join(', ') || undefined,
        center: f.center,
      };
    });
  } catch { return []; }
}

// ── Geoapify — INEGI-sourced Mexican address data, house-number precision ───
async function geocodeGeoapify(query: string, proximity: [number, number] | null): Promise<Suggestion[]> {
  if (!GEOAPIFY_KEY) return [];
  const params: Record<string, string> = {
    text: query, apiKey: GEOAPIFY_KEY, lang: 'es', limit: '6',
    type: 'amenity,building,street,suburb,district,city',
  };
  if (proximity) {
    const [lng, lat] = proximity;
    params.filter = `circle:${lng},${lat},5000`;
    params.bias   = `proximity:${lng},${lat}`;
  } else {
    params.filter = 'countrycode:mx';
  }
  try {
    const res  = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${new URLSearchParams(params)}`);
    const data = await res.json();
    return (data.features ?? []).map((f: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }) => {
      const p = f.properties;
      const label = (p.housenumber && p.street)
        ? `${p.street} ${p.housenumber}`
        : (p.name ?? p.street ?? p.formatted?.split(',')[0] ?? query);
      const sublabel = [p.suburb ?? p.district, p.city].filter(Boolean).join(', ') || undefined;
      return {
        id: `ga-${p.place_id ?? Math.random()}`,
        label, sublabel,
        center: [f.geometry.coordinates[0], f.geometry.coordinates[1]] as [number, number],
      };
    });
  } catch { return []; }
}

// ── Merged: Geoapify (INEGI data) → Overpass (local OSM) → MapTiler ─────────
async function geocode(query: string, proximity: [number, number] | null): Promise<Suggestion[]> {
  if (query.trim().length < 2) return [];

  const [ga, ov, mt] = await Promise.all([
    geocodeGeoapify(query, proximity),
    proximity ? geocodeOverpass(query, proximity) : Promise.resolve([] as Suggestion[]),
    geocodeMaptiler(query, proximity),
  ]);

  const seen   = new Set<string>();
  const merged: Suggestion[] = [];
  const add = (s: Suggestion) => {
    const key = `${Math.round(s.center[0] * 1000)},${Math.round(s.center[1] * 1000)}`;
    if (!seen.has(key)) { seen.add(key); merged.push(s); }
  };
  ga.forEach(add);   // Geoapify first — INEGI Mexican addresses
  ov.forEach(add);   // Overpass — local OSM POIs
  mt.forEach(add);   // MapTiler — global fallback

  // Annotate with distance and sort nearest-first
  return merged
    .slice(0, 8)
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
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<maplibregl.Map | null>(null);
  const markerA        = useRef<maplibregl.Marker | null>(null);
  const markerB        = useRef<maplibregl.Marker | null>(null);
  const proximityRef   = useRef<[number, number] | null>(null);
  const pinDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pinMode, setPinMode]       = useState<'A' | 'B' | null>(null);
  const [pinAddress, setPinAddress] = useState('');
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
    mapRef.current?.flyTo({ center, zoom: 16, duration: 700 });
  }, []);

  const placeB = useCallback((center: [number, number], label: string) => {
    setEndpointB({ label, center });
    setSugB([]);
    markerB.current?.remove();
    markerB.current = new maplibregl.Marker({ element: makeMarkerEl('B', '#ef4444') })
      .setLngLat(center).addTo(mapRef.current!);
    mapRef.current?.flyTo({ center, zoom: 16, duration: 700 });
  }, []);

  const handleSelectA = useCallback(async (s: Suggestion) => {
    if (s.id === '__map__') { setPinMode('A'); setPinAddress(''); return; }
    if (s.isCurrent) {
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
    if (s.id === '__map__') { setPinMode('B'); setPinAddress(''); return; }
    placeB(s.center, s.label);
  }, [placeB]);

  // ── Confirm pin at map center ─────────────────────────────────────────────
  const confirmPin = useCallback(async () => {
    if (!mapRef.current || !pinMode) return;
    const c    = mapRef.current.getCenter();
    const coord: [number, number] = [c.lng, c.lat];
    const label = pinAddress || await reverseGeocode(coord);
    if (pinMode === 'A') placeA(coord, label);
    else                 placeB(coord, label);
    setPinMode(null);
  }, [pinMode, pinAddress, placeA, placeB]);

  // ── Live reverse-geocode map center while in pin mode ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pinMode) return;
    const onMove = () => {
      if (pinDebounceRef.current) clearTimeout(pinDebounceRef.current);
      pinDebounceRef.current = setTimeout(async () => {
        const c = map.getCenter();
        const label = await reverseGeocode([c.lng, c.lat]);
        setPinAddress(label);
      }, 400);
    };
    map.on('move', onMove);
    // Seed immediately
    onMove();
    return () => { map.off('move', onMove); };
  }, [pinMode]);

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
    setPinMode(null);
    (mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current, style: STYLE_URL,
      center: [-99.133, 19.432], zoom: 15, attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    navigator.geolocation?.getCurrentPosition(
      pos => {
        proximityRef.current = [pos.coords.longitude, pos.coords.latitude];
        mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 800 });
      },
      () => {}, { timeout: 8000, maximumAge: 60000 },
    );
    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any });
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1d4ed8', 'line-width': 10, 'line-opacity': 0.3 } });
      map.addLayer({ id: 'route-line',   type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#60a5fa', 'line-width': 5,  'line-opacity': 0.95 } });
    });
    mapRef.current = map;
    return () => { markerA.current?.remove(); markerB.current?.remove(); map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor = step === 'error' ? 'text-red-400' : step === 'done' ? 'text-green-400' : 'text-gray-400';
  const statusText  = step === 'routing' ? 'Calculando ruta…'
    : step === 'done'    ? `✓ Ruta lista · ${distKm} km`
    : step === 'error'   ? 'No se encontró ruta entre esos puntos'
    : !endpointA.center  ? 'Busca el punto de inicio o usa el mapa'
    : !endpointB.center  ? 'Ahora busca el destino o usa el mapa'
    : 'Calculando…';

  return createPortal(
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 9999, background: '#0f1117' }}>

      {/* ── Header (hidden in pin mode) ─────────────────────────────────── */}
      {!pinMode && (
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
      )}

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      {!pinMode && (
        <div className={`flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs flex-shrink-0 ${statusColor}`}>
          {step === 'routing' && <Loader2 size={11} className="animate-spin" />}
          {statusText}
        </div>
      )}

      {/* ── Map (always full flex-1) ────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        <div ref={containerRef} className="absolute inset-0" />

        {/* ── Pin-drop mode overlay ────────────────────────────────────── */}
        {pinMode && (
          <>
            {/* Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 3 }}>
              <div className="relative flex items-center justify-center">
                {/* shadow pin */}
                <div className="absolute w-1 bg-white/20 rounded-full" style={{ height: 40, bottom: -20, left: '50%', transform: 'translateX(-50%)' }} />
                {/* pin head */}
                <div
                  className={`w-9 h-9 rounded-full border-4 border-white flex items-center justify-center shadow-2xl text-white font-bold text-base -translate-y-4`}
                  style={{ background: pinMode === 'A' ? '#22c55e' : '#ef4444', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                >
                  {pinMode}
                </div>
              </div>
            </div>

            {/* Top label + cancel */}
            <div className="absolute top-0 left-0 right-0 flex items-center gap-3 px-4 pt-safe pt-4 pb-3" style={{ zIndex: 4, background: 'linear-gradient(to bottom, rgba(15,17,23,0.95) 60%, transparent)' }}>
              <button onClick={() => setPinMode(null)} className="w-8 h-8 rounded-full bg-dark-800/80 flex items-center justify-center text-gray-300 flex-shrink-0">
                <X size={16} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-400">Mueve el mapa · Punto {pinMode}</div>
                <div className="text-sm text-white font-medium truncate">{pinAddress || '…'}</div>
              </div>
            </div>

            {/* Bottom confirm */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-8" style={{ zIndex: 4, background: 'linear-gradient(to top, rgba(15,17,23,0.97) 50%, transparent)' }}>
              <button
                onClick={confirmPin}
                className="w-full py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg"
              >
                <Check size={18} /> Confirmar ubicación
              </button>
            </div>
          </>
        )}
      </div>

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

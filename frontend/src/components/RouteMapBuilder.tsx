import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, RotateCcw, Check, Loader2, Search, MapPin } from 'lucide-react';

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

interface Suggestion { id: string; label: string; center: [number, number] }
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
  el.style.cssText = `width:34px;height:34px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.5);color:#fff;font-weight:bold;font-size:14px;`;
  el.textContent = label;
  return el;
}

async function geocode(query: string, proximity: [number, number] | null): Promise<Suggestion[]> {
  if (query.trim().length < 2) return [];
  const prox = proximity ? `&proximity=${proximity[0]},${proximity[1]}` : '';
  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&language=es&limit=6${prox}`;
    const res  = await fetch(url);
    const data = await res.json();
    return (data.features ?? []).map((f: Record<string, unknown>) => ({
      id:     f.id as string,
      label:  (f.place_name ?? f.text) as string,
      center: f.center as [number, number],
    }));
  } catch { return []; }
}

// ── Search input with autocomplete ─────────────────────────────────────────
function SearchInput({
  placeholder, value, color, suggestions, loading,
  onChange, onSelect, onMapClick,
}: {
  placeholder: string;
  value: string;
  color: string;
  suggestions: Suggestion[];
  loading: boolean;
  onChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  onMapClick: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-2 bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5 focus-within:border-brand-500 transition-colors">
        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
          style={{ background: color }}>
          {placeholder.charAt(0)}
        </div>
        <input
          value={value}
          placeholder={placeholder}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none min-w-0"
        />
        {loading
          ? <Loader2 size={14} className="text-gray-400 animate-spin flex-shrink-0" />
          : <Search size={14} className="text-gray-500 flex-shrink-0" />}
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-10 overflow-hidden">
          {suggestions.map(s => (
            <button key={s.id} onMouseDown={() => { onSelect(s); setOpen(false); }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-dark-700 transition-colors border-b border-dark-700/50 last:border-0">
              <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-200 leading-tight line-clamp-2">{s.label}</span>
            </button>
          ))}
          <button onMouseDown={onMapClick}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-dark-700 transition-colors border-t border-dark-700">
            <MapPin size={13} className="text-brand-400 flex-shrink-0" />
            <span className="text-sm text-brand-400">Seleccionar en el mapa</span>
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

  // Click-on-map mode: null = off, 'A' | 'B' = waiting for click
  const clickModeRef = useRef<'A' | 'B' | null>(null);
  const [clickMode, setClickMode] = useState<'A' | 'B' | null>(null);

  const [endpointA, setEndpointA] = useState<Endpoint>({ label: '', center: null });
  const [endpointB, setEndpointB] = useState<Endpoint>({ label: '', center: null });
  const [sugA, setSugA]     = useState<Suggestion[]>([]);
  const [sugB, setSugB]     = useState<Suggestion[]>([]);
  const [loadA, setLoadA]   = useState(false);
  const [loadB, setLoadB]   = useState(false);
  const debounceA            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceB            = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [step, setStep]     = useState<BuildStep>('idle');
  const [result, setResult] = useState<BuiltRoute | null>(null);
  const [distKm, setDistKm] = useState<number | null>(null);

  const profile = tipoActividad === 'ciclismo' ? 'bike' : 'foot';

  // ── Geocoding helpers ────────────────────────────────────────────────────
  const searchA = (q: string) => {
    setEndpointA(p => ({ ...p, label: q, center: null }));
    if (debounceA.current) clearTimeout(debounceA.current);
    if (q.length < 2) { setSugA([]); return; }
    setLoadA(true);
    debounceA.current = setTimeout(async () => {
      const res = await geocode(q, proximityRef.current);
      setSugA(res); setLoadA(false);
    }, 380);
  };

  const searchB = (q: string) => {
    setEndpointB(p => ({ ...p, label: q, center: null }));
    if (debounceB.current) clearTimeout(debounceB.current);
    if (q.length < 2) { setSugB([]); return; }
    setLoadB(true);
    debounceB.current = setTimeout(async () => {
      const res = await geocode(q, proximityRef.current);
      setSugB(res); setLoadB(false);
    }, 380);
  };

  const placeA = useCallback((center: [number, number], label: string) => {
    setEndpointA({ label, center });
    setSugA([]);
    markerA.current?.remove();
    markerA.current = new maplibregl.Marker({ element: makeMarkerEl('A', '#22c55e') })
      .setLngLat(center).addTo(mapRef.current!);
    mapRef.current?.flyTo({ center, zoom: 15, duration: 800 });
  }, []);

  const placeB = useCallback((center: [number, number], label: string) => {
    setEndpointB({ label, center });
    setSugB([]);
    markerB.current?.remove();
    markerB.current = new maplibregl.Marker({ element: makeMarkerEl('B', '#ef4444') })
      .setLngLat(center).addTo(mapRef.current!);
    mapRef.current?.flyTo({ center, zoom: 15, duration: 800 });
  }, []);

  // ── Route calculation ────────────────────────────────────────────────────
  const calcRoute = useCallback(async (a: [number, number], b: [number, number]) => {
    setStep('routing');
    try {
      const url =
        `https://router.project-osrm.org/route/v1/${profile}/${a[0]},${a[1]};${b[0]},${b[1]}` +
        `?geometries=geojson&overview=full&steps=false`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Sin ruta');

      const route  = data.routes[0];
      const coords: [number, number][] = route.geometry.coordinates;
      const km     = parseFloat((route.distance / 1000).toFixed(2));

      (mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)
        ?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } as any);

      if (mapRef.current && coords.length > 1) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new maplibregl.LngLatBounds(coords[0], coords[0]),
        );
        mapRef.current.fitBounds(bounds, { padding: 100, maxZoom: 17, duration: 800 });
      }

      setDistKm(km);
      setResult({ coordinates: coords, distanceKm: km, gpxContent: coordsToGpx(coords, 'Ruta trazada') });
      setStep('done');
    } catch {
      setStep('error');
    }
  }, [profile]);

  // Auto-calc when both endpoints are set
  useEffect(() => {
    if (endpointA.center && endpointB.center) {
      calcRoute(endpointA.center, endpointB.center);
    }
  }, [endpointA.center, endpointB.center, calcRoute]);

  const reset = useCallback(() => {
    markerA.current?.remove(); markerA.current = null;
    markerB.current?.remove(); markerB.current = null;
    setEndpointA({ label: '', center: null });
    setEndpointB({ label: '', center: null });
    setSugA([]); setSugB([]);
    setStep('idle'); setResult(null); setDistKm(null);
    clickModeRef.current = null; setClickMode(null);
    (mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any);
  }, []);

  // ── Map init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-99.133, 19.432],
      zoom: 13,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    navigator.geolocation?.getCurrentPosition(
      pos => {
        proximityRef.current = [pos.coords.longitude, pos.coords.latitude];
        mapRef.current?.setCenter([pos.coords.longitude, pos.coords.latitude]);
      },
      () => {},
      { timeout: 8000, maximumAge: 60000 },
    );

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any,
      });
      map.addLayer({
        id: 'route-casing', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1d4ed8', 'line-width': 10, 'line-opacity': 0.3 },
      });
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#60a5fa', 'line-width': 5, 'line-opacity': 0.95 },
      });
    });

    // Click on map to place marker
    map.on('click', e => {
      const mode = clickModeRef.current;
      if (!mode) return;
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const label = `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`;
      if (mode === 'A') { placeA(lngLat, label); }
      else              { placeB(lngLat, label); }
      clickModeRef.current = null;
      setClickMode(null);
    });

    map.getCanvas().style.cursor = '';

    mapRef.current = map;
    return () => {
      markerA.current?.remove();
      markerB.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update cursor when in click mode
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getCanvas().style.cursor = clickMode ? 'crosshair' : '';
  }, [clickMode]);

  const enterClickMode = (which: 'A' | 'B') => {
    clickModeRef.current = which;
    setClickMode(which);
  };

  const statusText = step === 'routing' ? 'Calculando ruta…'
    : step === 'done'    ? `Ruta lista · ${distKm?.toFixed(2)} km`
    : step === 'error'   ? 'No se encontró ruta. Intenta otros puntos.'
    : clickMode          ? `Toca el mapa para marcar el punto ${clickMode}`
    : !endpointA.center  ? 'Busca o toca el mapa para marcar el inicio (A)'
    : !endpointB.center  ? 'Ahora busca o toca el mapa para marcar el destino (B)'
    : 'Calculando…';

  return createPortal(
    <div className="fixed inset-0 flex flex-col bg-dark-900" style={{ zIndex: 9999 }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-900 border-b border-white/10 flex-shrink-0">
        <button onClick={onCancel} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors">
          <X size={20} />
        </button>
        <span className="text-sm font-semibold text-white">Trazar ruta</span>
        <button onClick={reset} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors">
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Search inputs */}
      <div className="px-3 py-2.5 bg-dark-900 border-b border-white/10 space-y-2 flex-shrink-0">
        <SearchInput
          placeholder="Inicio (A)"
          value={endpointA.label}
          color="#22c55e"
          suggestions={sugA}
          loading={loadA}
          onChange={searchA}
          onSelect={s => placeA(s.center, s.label)}
          onMapClick={() => enterClickMode('A')}
        />
        <SearchInput
          placeholder="Destino (B)"
          value={endpointB.label}
          color="#ef4444"
          suggestions={sugB}
          loading={loadB}
          onChange={searchB}
          onSelect={s => placeB(s.center, s.label)}
          onMapClick={() => enterClickMode('B')}
        />
      </div>

      {/* Status hint */}
      <div className={`px-4 py-2 text-xs text-center flex-shrink-0 flex items-center justify-center gap-1.5 ${
        step === 'error'   ? 'bg-red-500/15 text-red-300' :
        step === 'done'    ? 'bg-green-500/10 text-green-300' :
        clickMode          ? 'bg-blue-500/15 text-blue-300' :
        'bg-dark-800 text-gray-400'
      }`}>
        {step === 'routing' && <Loader2 size={12} className="animate-spin" />}
        {statusText}
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* Bottom actions */}
      {(step === 'done' || step === 'error') && (
        <div className="px-4 py-4 bg-dark-900 border-t border-white/10 flex gap-3 flex-shrink-0">
          <button onClick={reset}
            className="flex-1 py-3 rounded-xl border border-dark-600 text-gray-300 hover:text-white text-sm font-semibold transition-colors">
            Reiniciar
          </button>
          {step === 'done' && result && (
            <button onClick={() => onConfirm(result)}
              className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
              <Check size={16} /> Usar esta ruta
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

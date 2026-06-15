import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, RotateCcw, Check, Loader2 } from 'lucide-react';

export interface BuiltRoute {
  coordinates: [number, number][]; // [lng, lat]
  distanceKm: number;
  gpxContent: string;
}

interface Props {
  tipoActividad: string;
  onConfirm: (route: BuiltRoute) => void;
  onCancel: () => void;
}

type BuildStep = 'start' | 'end' | 'routing' | 'done' | 'error';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

function coordsToGpx(coords: [number, number][], name: string): string {
  const pts = coords
    .map(([lng, lat]) => `    <trkpt lat="${lat}" lon="${lng}"><time>${new Date().toISOString()}</time></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="JTZ Running Club">
  <trk><name>${name}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;
}

function makeMarkerEl(label: string, color: string) {
  const el = document.createElement('div');
  el.style.cssText = `width:36px;height:36px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.5);color:#fff;font-weight:bold;font-size:15px;cursor:pointer;user-select:none;`;
  el.textContent = label;
  return el;
}

const STEP_HINT: Record<BuildStep, string> = {
  start:   'Toca el mapa para marcar el punto de INICIO (A)',
  end:     'Ahora toca el punto de LLEGADA (B)',
  routing: 'Calculando ruta…',
  done:    'Ruta lista. Confirma o reinicia.',
  error:   'No se pudo calcular la ruta. Reinicia e intenta de nuevo.',
};

export default function RouteMapBuilder({ tipoActividad, onConfirm, onCancel }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const startMarker   = useRef<maplibregl.Marker | null>(null);
  const endMarker     = useRef<maplibregl.Marker | null>(null);
  const stepRef       = useRef<BuildStep>('start');
  const startCoord    = useRef<[number, number] | null>(null);

  const [step, setStep]     = useState<BuildStep>('start');
  const [result, setResult] = useState<BuiltRoute | null>(null);
  const [distKm, setDistKm] = useState<number | null>(null);

  const profile = tipoActividad === 'ciclismo' ? 'bike' : 'foot';

  const reset = useCallback(() => {
    startMarker.current?.remove(); startMarker.current = null;
    endMarker.current?.remove();   endMarker.current   = null;
    startCoord.current = null;
    stepRef.current = 'start';
    setStep('start');
    setResult(null);
    setDistKm(null);
    // Clear route on map
    (mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } as any);
  }, []);

  const fetchRoute = useCallback(async (a: [number, number], b: [number, number]) => {
    stepRef.current = 'routing';
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
      const gpx    = coordsToGpx(coords, 'Ruta trazada');

      // Draw on map
      (mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)
        ?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } as any);

      // Fit bounds
      if (mapRef.current && coords.length > 1) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
        );
        mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 800 });
      }

      setDistKm(km);
      setResult({ coordinates: coords, distanceKm: km, gpxContent: gpx });
      stepRef.current = 'done';
      setStep('done');
    } catch {
      stepRef.current = 'error';
      setStep('error');
    }
  }, [profile]);

  // Init map
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
      pos => mapRef.current?.setCenter([pos.coords.longitude, pos.coords.latitude]),
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

    map.on('click', e => {
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (stepRef.current === 'start') {
        startMarker.current?.remove();
        startMarker.current = new maplibregl.Marker({ element: makeMarkerEl('A', '#22c55e') })
          .setLngLat(lngLat).addTo(map);
        startCoord.current = lngLat;
        stepRef.current = 'end';
        setStep('end');

      } else if (stepRef.current === 'end') {
        endMarker.current?.remove();
        endMarker.current = new maplibregl.Marker({ element: makeMarkerEl('B', '#ef4444') })
          .setLngLat(lngLat).addTo(map);
        fetchRoute(startCoord.current!, lngLat);
      }
    });

    mapRef.current = map;
    return () => {
      startMarker.current?.remove();
      endMarker.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-dark-900">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-900/95 backdrop-blur border-b border-white/10 z-10">
        <button onClick={onCancel} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors">
          <X size={20} />
        </button>
        <span className="text-sm font-semibold text-white">Trazar ruta en mapa</span>
        <button onClick={reset} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors">
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Hint banner */}
      <div className={`px-4 py-2.5 text-sm text-center font-medium z-10 ${
        step === 'error' ? 'bg-red-500/20 text-red-300' :
        step === 'done'  ? 'bg-green-500/10 text-green-300' :
        'bg-brand-500/15 text-brand-300'
      }`}>
        {step === 'routing'
          ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />{STEP_HINT.routing}</span>
          : STEP_HINT[step]}
        {step === 'done' && distKm && <span className="ml-2 text-gray-400">· {distKm.toFixed(2)} km</span>}
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* Bottom actions */}
      {(step === 'done' || step === 'error') && (
        <div className="px-4 py-4 bg-dark-900/95 backdrop-blur border-t border-white/10 flex gap-3">
          <button onClick={reset}
            className="flex-1 py-3 rounded-xl border border-dark-600 text-gray-300 hover:text-white hover:border-dark-500 transition-colors text-sm font-semibold">
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
    </div>
  );
}

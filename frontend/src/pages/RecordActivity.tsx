import { useState, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Play, Pause, Square, MapPin, Heart, Clock, ChevronLeft,
  CheckCircle, Map, Navigation, Zap, TrendingUp, Mountain,
} from 'lucide-react';
import { integrationsApi, routesApi } from '../services/api';
import { useActivityRecorder, formatPace, formatElapsed, bearingDeg } from '../hooks/useActivityRecorder';
import { parseGpx } from '../utils/gpxParser';
import type { MapPoint } from '../components/LiveTrackingMap';

const LiveTrackingMap = lazy(() => import('../components/LiveTrackingMap'));

const TIPOS = [
  { value: 'correr',   label: 'Correr'   },
  { value: 'trail',    label: 'Trail'    },
  { value: 'ciclismo', label: 'Ciclismo' },
  { value: 'natacion', label: 'Natación' },
  { value: 'otro',     label: 'Otro'     },
];

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, d2r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function RecordActivity() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeId      = searchParams.get('routeId')      ? Number(searchParams.get('routeId'))      : null;
  const savedRouteId = searchParams.get('savedRouteId') ? Number(searchParams.get('savedRouteId')) : null;

  const qc = useQueryClient();
  const { state, start, pause, resume, finish, reset, getGpx } = useActivityRecorder();
  const [tipo, setTipo] = useState('correr');
  const [nombre, setNombre] = useState('');
  const [saved, setSaved] = useState(false);
  const [showMap, setShowMap] = useState(true); // map on by default

  const { data: refActivityData } = useQuery({
    queryKey: ['ref-activity', routeId],
    queryFn: () => integrationsApi.getActivity(routeId!),
    enabled: !!routeId,
  });

  const { data: savedRouteData } = useQuery({
    queryKey: ['saved-route', savedRouteId],
    queryFn: () => routesApi.get(savedRouteId!),
    enabled: !!savedRouteId,
  });

  const referenceRoute = useMemo<MapPoint[]>(() => {
    const gpx = refActivityData?.data?.gpxContent ?? savedRouteData?.data?.gpxContent;
    if (!gpx) return [];
    try { return parseGpx(gpx).trackPoints.map(p => ({ lat: p.lat, lng: p.lng })); }
    catch { return []; }
  }, [refActivityData, savedRouteData]);

  const activeRouteKmLabel = savedRouteData?.data?.distanciaKm
    ? `${savedRouteData.data.distanciaKm.toFixed(1)} km`
    : null;

  const trackMapPoints = useMemo<MapPoint[]>(
    () => state.track.map(p => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy })),
    [state.track],
  );

  const currentPos: MapPoint | undefined = trackMapPoints.length > 0
    ? trackMapPoints[trackMapPoints.length - 1] : undefined;

  // Cumulative distance along the reference route — precomputed once so
  // "remaining distance" is O(1) instead of summing the whole tail each fix.
  const routeCum = useMemo(() => {
    const c = new Array(referenceRoute.length).fill(0);
    for (let i = 1; i < referenceRoute.length; i++) {
      c[i] = c[i - 1] + haversineM(referenceRoute[i - 1], referenceRoute[i]);
    }
    return c;
  }, [referenceRoute]);

  // Remember where we were on the route so we only scan a small window ahead,
  // not the whole polyline, on every position update.
  const navIdxRef = useRef(0);

  // Heavy route math depends only on position (not heading) — kept separate so
  // the 5×/sec compass updates don't re-scan the route.
  const routeNav = useMemo(() => {
    const n = referenceRoute.length;
    if (!currentPos || n < 2) return null;

    const scan = (from: number, to: number) => {
      let md = Infinity, mi = from;
      for (let i = from; i < to; i++) {
        const d = haversineM(currentPos, referenceRoute[i]);
        if (d < md) { md = d; mi = i; }
      }
      return { md, mi };
    };

    // Windowed search around the last known position…
    const from = Math.max(0, navIdxRef.current - 15);
    const to   = Math.min(n, navIdxRef.current + 80);
    let { md: minDist, mi: minIdx } = scan(from, to);
    // …with a full-route fallback if we drifted off the window (off route / GPS jump).
    if (minDist > 60 || minIdx <= from + 1 || minIdx >= to - 1) {
      const full = scan(0, n);
      if (full.md < minDist) { minDist = full.md; minIdx = full.mi; }
    }
    navIdxRef.current = minIdx;

    const remM = routeCum[n - 1] - routeCum[minIdx];

    // Aim ~25 m ahead along the route for the next-direction bearing.
    let aheadIdx = minIdx, acc = 0;
    while (aheadIdx < n - 1 && acc < 25) {
      acc += haversineM(referenceRoute[aheadIdx], referenceRoute[aheadIdx + 1]);
      aheadIdx++;
    }
    const absBearing = bearingDeg(currentPos, referenceRoute[aheadIdx]);
    return { minDist, remM, absBearing };
  }, [currentPos, referenceRoute, routeCum]);

  const navInfo = useMemo(() => {
    if (!routeNav) return null;
    const { minDist, remM, absBearing } = routeNav;

    const heading = state.headingDeg;
    const hasHeading = heading != null;
    const relBearing = hasHeading ? (absBearing - heading + 360) % 360 : absBearing;
    const signed = relBearing > 180 ? relBearing - 360 : relBearing;
    const a = Math.abs(signed);

    type Turn = 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'uturn';
    let turn: Turn = 'straight';
    if (a <= 20)       turn = 'straight';
    else if (a <= 55)  turn = signed > 0 ? 'slight-right' : 'slight-left';
    else if (a < 150)  turn = signed > 0 ? 'right' : 'left';
    else               turn = 'uturn';

    return {
      offRouteM: minDist, remainingKm: remM / 1000,
      relBearing, absBearing, signed, turn,
      offRoute: minDist > 50, atFinish: remM < 20, hasHeading,
    };
  }, [routeNav, state.headingDeg]);

  const totalRouteKm = useMemo(() => {
    if (referenceRoute.length < 2) return 0;
    return referenceRoute.reduce((acc, _, i, arr) => i === 0 ? 0 : acc + haversineM(arr[i - 1], arr[i]), 0) / 1000;
  }, [referenceRoute]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const actName = nombre.trim() || `${TIPOS.find(t => t.value === tipo)?.label ?? 'Actividad'} — ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}`;
      const gpx = state.track.length > 1 ? getGpx(actName) : undefined;
      return integrationsApi.logActivity({
        nombre: actName, tipo,
        distanciaKm: parseFloat(state.distanceKm.toFixed(3)),
        duracionMin: Math.round(state.elapsed / 60),
        ...(state.paceMinKm ? { ritmoMinKm: parseFloat(state.paceMinKm.toFixed(2)) } : {}),
        ...(state.fcActual  ? { fcPromedio: state.fcActual } : {}),
        ...(gpx ? { gpxContent: gpx, gpxNombre: `${actName}.gpx` } : {}),
        fuente: 'app',
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-activities'] }); setSaved(true); },
  });

  // ── Saved screen ──────────────────────────────────────────────────────────
  if (saved) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle size={64} className="text-green-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">¡Actividad guardada!</h2>
        <p className="text-gray-400 mb-2">{state.distanceKm.toFixed(2)} km · {formatElapsed(state.elapsed)}</p>
        <p className="text-gray-400 mb-8">Ritmo {formatPace(state.paceMinKm)} /km</p>
        <button onClick={() => { reset(); navigate('/actividades'); }}
          className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold transition-colors">
          Ver mis actividades
        </button>
      </div>
    );
  }

  // ── Summary screen ────────────────────────────────────────────────────────
  if (state.status === 'finished') {
    return (
      <div className="min-h-screen bg-dark-900 p-6 flex flex-col max-w-lg mx-auto">
        <button onClick={() => { reset(); navigate(-1); }} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6">
          <ChevronLeft size={20} /> Descartar
        </button>
        <h2 className="text-xl font-bold text-white mb-6">Resumen de actividad</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard label="Distancia"    value={`${state.distanceKm.toFixed(2)} km`} />
          <StatCard label="Tiempo"       value={formatElapsed(state.elapsed)} />
          <StatCard label="Ritmo promedio" value={`${formatPace(state.paceMinKm)} /km`} />
          <StatCard label="Desnivel+"    value={state.elevationGainM > 0 ? `+${Math.round(state.elevationGainM)} m` : '-- m'} />
          {state.currentAltitudeM != null && (
            <StatCard label="Altitud máx." value={`${Math.round(state.currentAltitudeM)} m`} />
          )}
          <StatCard label="Puntos GPS"   value={String(state.track.length)} />
        </div>
        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tipo de actividad</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500">
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre (opcional)</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Entrenamiento matutino"
              className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600" />
          </div>
        </div>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold text-lg transition-colors disabled:opacity-50">
          {saveMutation.isPending ? 'Guardando...' : 'Guardar actividad'}
        </button>
        {saveMutation.isError && <p className="text-red-400 text-sm text-center mt-3">Error al guardar. Intenta de nuevo.</p>}
      </div>
    );
  }

  // ── Main recording screen ─────────────────────────────────────────────────
  const isActive = state.status === 'running' || state.status === 'paused';

  // MAP MODE — map fills the screen, compact overlay at bottom
  if (showMap) {
    return (
      <div className="fixed inset-0 flex flex-col bg-dark-900" style={{ zIndex: 40 }}>

        {/* ── Top bar overlay ── */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 pt-safe bg-gradient-to-b from-dark-900/80 to-transparent">
          <div>
            {state.status === 'idle' ? (
              <button onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-white/80 hover:text-white bg-dark-900/60 backdrop-blur-sm px-3 py-1.5 rounded-xl text-sm">
                <ChevronLeft size={16} /> Cancelar
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-dark-900/60 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                <span className={`w-2 h-2 rounded-full ${state.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
                <span className="text-xs font-semibold text-white">{state.status === 'running' ? 'Grabando' : 'Pausado'}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(routeId || savedRouteId) && referenceRoute.length > 0 && (
              <div className="bg-dark-900/60 backdrop-blur-sm px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <Navigation size={12} className="text-blue-400" />
                <span className="text-xs text-blue-300">
                  {activeRouteKmLabel ?? `${totalRouteKm.toFixed(1)} km`}
                </span>
              </div>
            )}
            <button onClick={() => setShowMap(false)}
              className="bg-dark-900/60 backdrop-blur-sm px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs text-white/70 hover:text-white">
              <Map size={13} /> Métricas
            </button>
            <div className="bg-dark-900/60 backdrop-blur-sm px-2 py-1.5 rounded-xl flex items-center gap-1">
              <MapPin size={13} className="text-brand-400" />
              <span className="text-xs text-gray-300">GPS</span>
            </div>
          </div>
        </div>

        {/* ── Full-screen map ── */}
        <div className="flex-1 min-h-0">
          <Suspense fallback={
            <div className="w-full h-full bg-dark-800 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <LiveTrackingMap
              track={trackMapPoints}
              referenceRoute={referenceRoute.length > 0 ? referenceRoute : undefined}
              currentPos={currentPos}
              heading={state.headingDeg}
              className="w-full h-full"
            />
          </Suspense>
        </div>

        {/* ── Bottom panel ── */}
        <div className="bg-dark-900/95 backdrop-blur-md border-t border-white/10 flex-shrink-0">

          {/* Navigation guide */}
          {(routeId || savedRouteId) && isActive && navInfo && (() => {
            const g = navGuide(navInfo);
            const bg = g.tone === 'ok' ? 'bg-green-500/10' : g.tone === 'turn' ? 'bg-yellow-500/10' : 'bg-red-500/10';
            const ring = g.tone === 'ok' ? 'border-green-400/50' : g.tone === 'turn' ? 'border-yellow-400/50' : 'border-red-400/50';
            return (
              <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] ${bg}`}>
                {/* Big direction arrow — rotates toward where to head next */}
                <div
                  className={`w-12 h-12 rounded-full bg-dark-900/60 border-2 ${ring} flex items-center justify-center flex-shrink-0`}
                  style={{ transform: `rotate(${navInfo.relBearing}deg)`, transition: 'transform 0.5s ease' }}
                  title={`${Math.round(navInfo.absBearing)}°`}
                >
                  <Navigation size={22} className={g.color} fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-base font-bold leading-tight ${g.color}`}>{g.text}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {navInfo.offRoute
                      ? `A ${Math.round(navInfo.offRouteM)} m de la ruta · `
                      : ''}
                    {navInfo.remainingKm.toFixed(2)} km restantes
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Idle: type selector */}
          {state.status === 'idle' && (
            <div className="px-4 pt-3 pb-2">
              <div className="flex flex-wrap gap-2">
                {TIPOS.map(t => (
                  <button key={t.value} onClick={() => setTipo(t.value)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      tipo === t.value ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Metrics row */}
          <div className="grid grid-cols-5 gap-0 px-2 py-4">
            <MetricCell value={formatElapsed(state.elapsed)} label="Tiempo" icon={<Clock size={10} />} />
            <MetricCell value={state.distanceKm.toFixed(2)} label="km" icon={<Zap size={10} />} highlight />
            <MetricCell value={formatPace(state.currentPaceMinKm ?? state.paceMinKm)} label="min/km" />
            <MetricCell
              value={state.elevationGainM > 0 ? `+${Math.round(state.elevationGainM)}` : (state.currentAltitudeM != null ? `${Math.round(state.currentAltitudeM)}` : '--')}
              label={state.elevationGainM > 0 ? 'desnivel m' : 'altitud m'}
              icon={<TrendingUp size={10} />}
              color="text-emerald-400"
            />
            <MetricCell
              value={state.fcActual ? String(state.fcActual) : '--'}
              label="bpm"
              icon={<Heart size={10} />}
              color={state.fcActual ? 'text-red-400' : undefined}
            />
          </div>

          {/* Error */}
          {state.error && (
            <p className="text-red-400 text-xs text-center px-4 pb-2">{state.error}</p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-8 pb-6 pb-safe">
            {state.status === 'idle' && (
              <button onClick={start}
                className="w-20 h-20 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/40 transition-all active:scale-95">
                <Play size={32} className="text-white ml-1" fill="white" />
              </button>
            )}
            {state.status === 'running' && (
              <>
                <button onClick={pause}
                  className="w-16 h-16 rounded-full bg-dark-700 border border-dark-600 flex items-center justify-center active:scale-95">
                  <Pause size={24} className="text-white" fill="white" />
                </button>
                <button onClick={finish}
                  className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95">
                  <Square size={24} className="text-white" fill="white" />
                </button>
              </>
            )}
            {state.status === 'paused' && (
              <>
                <button onClick={resume}
                  className="w-16 h-16 rounded-full bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 active:scale-95">
                  <Play size={24} className="text-white ml-1" fill="white" />
                </button>
                <button onClick={finish}
                  className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95">
                  <Square size={24} className="text-white" fill="white" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // METRICS MODE — no map, big numbers
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-safe">
        <div>
          {state.status === 'idle' ? (
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white">
              <ChevronLeft size={20} /> Cancelar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${state.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
              <span className="text-sm text-gray-400">{state.status === 'running' ? 'Grabando' : 'Pausado'}</span>
            </div>
          )}
        </div>
        <button onClick={() => setShowMap(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-dark-700 border border-dark-600 text-gray-400 hover:text-white transition-all">
          <Map size={13} /> Mapa
        </button>
      </div>

      {/* Tipo (idle only) */}
      {state.status === 'idle' && (
        <div className="px-6 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {TIPOS.map(t => (
              <button key={t.value} onClick={() => setTipo(t.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  tipo === t.value ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation guide */}
      {(routeId || savedRouteId) && isActive && navInfo && (() => {
        const g = navGuide(navInfo);
        const bg = g.tone === 'ok' ? 'bg-green-500/10 border-green-500/20' : g.tone === 'turn' ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20';
        const ring = g.tone === 'ok' ? 'border-green-400/50' : g.tone === 'turn' ? 'border-yellow-400/50' : 'border-red-400/50';
        return (
          <div className={`mx-4 mb-3 px-4 py-3 rounded-xl border flex items-center gap-3 ${bg}`}>
            <div
              className={`w-12 h-12 rounded-full bg-dark-900/60 border-2 ${ring} flex items-center justify-center flex-shrink-0`}
              style={{ transform: `rotate(${navInfo.relBearing}deg)`, transition: 'transform 0.5s ease' }}
            >
              <Navigation size={22} className={g.color} fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-base font-bold leading-tight ${g.color}`}>{g.text}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {navInfo.offRoute ? `A ${Math.round(navInfo.offRouteM)} m de la ruta · ` : ''}
                {navInfo.remainingKm.toFixed(2)} km restantes
              </div>
            </div>
          </div>
        );
      })()}

      {/* Big metrics */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-center">
          <div className="text-7xl font-mono font-bold text-white tracking-tight">{formatElapsed(state.elapsed)}</div>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-gray-500 text-sm"><Clock size={14} /> Tiempo</div>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          {[
            { v: state.distanceKm.toFixed(2), l: 'km', icon: <Zap size={11} /> },
            { v: formatPace(state.currentPaceMinKm ?? state.paceMinKm), l: 'min/km actual' },
            { v: formatPace(state.paceMinKm), l: 'ritmo promedio' },
            { v: state.fcActual ? String(state.fcActual) : '--', l: 'bpm', icon: <Heart size={11} />, c: state.fcActual ? 'text-red-400' : 'text-gray-600' },
            {
              v: state.elevationGainM > 0 ? `+${Math.round(state.elevationGainM)} m` : '--',
              l: 'desnivel+', icon: <TrendingUp size={11} />, c: 'text-emerald-400',
            },
            {
              v: state.currentAltitudeM != null ? `${Math.round(state.currentAltitudeM)} m` : '--',
              l: 'altitud', icon: <Mountain size={11} />, c: state.currentAltitudeM != null ? 'text-sky-400' : 'text-gray-600',
            },
          ].map(({ v, l, icon, c }, i) => (
            <div key={i} className="bg-dark-800 rounded-2xl p-4 text-center border border-dark-700">
              <div className={`text-3xl font-bold ${c ?? 'text-white'}`}>{v}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">{icon}{l}</div>
            </div>
          ))}
        </div>
        {state.error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-center">{state.error}</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 p-8 pb-safe">
        {state.status === 'idle' && (
          <button onClick={start}
            className="w-24 h-24 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30 transition-all active:scale-95">
            <Play size={36} className="text-white ml-1" fill="white" />
          </button>
        )}
        {state.status === 'running' && (
          <>
            <button onClick={pause} className="w-20 h-20 rounded-full bg-dark-700 border border-dark-600 hover:bg-dark-600 flex items-center justify-center active:scale-95">
              <Pause size={28} className="text-white" fill="white" />
            </button>
            <button onClick={finish} className="w-20 h-20 rounded-full bg-red-500/90 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20 active:scale-95">
              <Square size={28} className="text-white" fill="white" />
            </button>
          </>
        )}
        {state.status === 'paused' && (
          <>
            <button onClick={resume} className="w-20 h-20 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30 active:scale-95">
              <Play size={28} className="text-white ml-1" fill="white" />
            </button>
            <button onClick={finish} className="w-20 h-20 rounded-full bg-red-500/90 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20 active:scale-95">
              <Square size={28} className="text-white" fill="white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

type NavGuide = {
  offRoute: boolean; atFinish: boolean; hasHeading: boolean;
  turn: 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'uturn';
};

// Maps the nav state to a spoken-style instruction, color and a tone.
function navGuide(n: NavGuide): { text: string; color: string; tone: 'ok' | 'turn' | 'bad' } {
  if (n.atFinish)  return { text: '¡Llegaste al final!', color: 'text-green-400', tone: 'ok' };
  if (n.offRoute)  return { text: 'Vuelve a la ruta', color: 'text-red-400', tone: 'bad' };
  if (!n.hasHeading) return { text: 'Empieza a moverte para guiarte', color: 'text-gray-300', tone: 'turn' };
  switch (n.turn) {
    case 'straight':     return { text: 'Sigue recto', color: 'text-green-400', tone: 'ok' };
    case 'slight-left':  return { text: 'Ligera izquierda', color: 'text-green-400', tone: 'ok' };
    case 'slight-right': return { text: 'Ligera derecha', color: 'text-green-400', tone: 'ok' };
    case 'left':         return { text: 'Gira a la izquierda', color: 'text-yellow-400', tone: 'turn' };
    case 'right':        return { text: 'Gira a la derecha', color: 'text-yellow-400', tone: 'turn' };
    case 'uturn':        return { text: 'Media vuelta · vas al revés', color: 'text-red-400', tone: 'bad' };
  }
}

function MetricCell({ value, label, icon, highlight, color }: {
  value: string; label: string; icon?: React.ReactNode; highlight?: boolean; color?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-1">
      <div className={`font-bold font-mono ${highlight ? 'text-2xl text-brand-400' : `text-xl ${color ?? 'text-white'}`}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-0.5">{icon}{label}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

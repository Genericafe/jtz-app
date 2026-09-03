import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Square, MapPin, Clock, Zap, Loader2, AlertCircle } from 'lucide-react';
import { publicApi } from '../services/api';
import type { MapPoint } from '../components/LiveTrackingMap';

const LiveTrackingMap = lazy(() => import('../components/LiveTrackingMap'));

interface Info { eventId: number; eventNombre: string; fecha: string; lugar: string; ciudad?: string; tipo: string; leadId: number; nombre: string; dorsal: number | null }

// Haversine distance in km between two lat/lng points.
function distKm(a: MapPoint, b: MapPoint): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const la1 = a.lat * toR, la2 = b.lat * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function ParticipantRecord() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [dist, setDist] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [pos, setPos] = useState<MapPoint | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);

  const watchRef = useRef<number | null>(null);
  const trailRef = useRef<MapPoint[]>([]);
  const distRef = useRef(0);
  const lastPingRef = useRef(0);
  const startTimeRef = useRef(0);
  const wakeRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    publicApi.participantInfo(token)
      .then(r => setInfo(r.data as Info))
      .catch(e => setLoadErr(e?.response?.data?.error ?? 'No pudimos abrir tu enlace. Verifica que sea el correcto.'));
  }, [token]);

  useEffect(() => () => { // cleanup on unmount
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    wakeRef.current?.release?.().catch(() => {});
  }, []);

  const sendPing = (extra: object = {}) => {
    const tail = trailRef.current.slice(-600).map(p => [p.lng, p.lat]);
    const last = trailRef.current[trailRef.current.length - 1];
    publicApi.participantPing(token, {
      lat: last?.lat, lng: last?.lng, trail: JSON.stringify(tail), distanciaKm: distRef.current, ...extra,
    }).catch(() => {});
  };

  const start = async () => {
    if (!navigator.geolocation) { setGpsErr('Tu dispositivo no permite GPS.'); return; }
    setGpsErr(null);
    try { await publicApi.participantStart(token, { tipo: info?.tipo === 'trail' ? 'trail' : 'correr' }); } catch { /* keep going */ }
    trailRef.current = []; distRef.current = 0; setDist(0); setElapsed(0);
    startTimeRef.current = Date.now();
    setRunning(true);
    try { wakeRef.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignore */ }

    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);

    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const pt = { lat: p.coords.latitude, lng: p.coords.longitude };
        const acc = p.coords.accuracy ?? 999;
        const prev = trailRef.current[trailRef.current.length - 1];
        if (prev) {
          const d = distKm(prev, pt);
          // Ignore tiny jitter and wild GPS jumps
          if (d > 0.003 && d < 0.2 && acc < 40) { distRef.current += d; setDist(distRef.current); trailRef.current.push(pt); }
          else if (d >= 0.003 && acc < 40) { trailRef.current.push(pt); }
        } else {
          trailRef.current.push(pt);
        }
        setPos(pt);
        const now = Date.now();
        if (now - lastPingRef.current > 4000) { lastPingRef.current = now; sendPing(); }
      },
      () => setGpsErr('No pudimos acceder a tu ubicación. Activa el GPS y da permiso de ubicación.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  };

  const stop = () => {
    setRunning(false);
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    wakeRef.current?.release?.().catch(() => {}); wakeRef.current = null;
    sendPing();
    publicApi.participantStop(token).catch(() => {});
  };

  const hhmmss = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h > 0 ? `${h}:` : '') + `${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
  };
  const pace = dist > 0.05 ? elapsed / 60 / dist : 0;

  if (loadErr) return (
    <div className="min-h-screen bg-surface-900 text-white flex items-center justify-center px-4">
      <div className="card p-8 max-w-sm text-center">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <h1 className="heading-display text-xl text-white mb-1">Enlace no válido</h1>
        <p className="text-gray-400 text-sm">{loadErr}</p>
      </div>
    </div>
  );

  if (!info) return (
    <div className="min-h-screen bg-surface-900 text-white flex items-center justify-center">
      <Loader2 className="animate-spin text-brand-400" size={28} />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      {/* Header */}
      <div className="bg-hero topo-bg px-4 pt-6 pb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Zap size={16} className="text-white" fill="white" /></div>
          <span className="heading-display text-lg">JTZ Trail</span>
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-white/70">{info.eventNombre}</p>
        <h1 className="heading-display text-2xl mt-1">{info.nombre}</h1>
        {info.dorsal != null && <p className="text-white/80 text-sm mt-0.5">Corredor <span className="font-black">#{info.dorsal}</span></p>}
      </div>

      <div className="max-w-md mx-auto px-4 -mt-5">
        {/* Live map */}
        <div className="card overflow-hidden mb-4" style={{ height: 300 }}>
          {pos ? (
            <Suspense fallback={<div className="w-full h-full bg-dark-800 flex items-center justify-center text-gray-500 text-sm">Cargando mapa…</div>}>
              <LiveTrackingMap track={trailRef.current} currentPos={pos} heading={null} className="w-full h-full" />
            </Suspense>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm text-center px-6">
              {running ? 'Buscando señal GPS…' : 'Presiona “Iniciar” para comenzar a marcar tu recorrido.'}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center justify-center gap-1"><MapPin size={11} /> Distancia</p>
            <p className="text-2xl font-black text-white mt-1">{dist.toFixed(2)}<span className="text-sm text-gray-500"> km</span></p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center justify-center gap-1"><Clock size={11} /> Tiempo</p>
            <p className="text-2xl font-black text-white mt-1">{hhmmss(elapsed)}</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Ritmo</p>
            <p className="text-2xl font-black text-white mt-1">{pace > 0 ? `${Math.floor(pace)}'${String(Math.round((pace % 1) * 60)).padStart(2, '0')}` : '--'}<span className="text-sm text-gray-500"> /km</span></p>
          </div>
        </div>

        {gpsErr && <div className="mb-3 text-sm text-amber-400 bg-amber-500/10 rounded-xl px-4 py-3 flex items-start gap-2"><AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {gpsErr}</div>}

        {!running ? (
          <button onClick={start}
            className="w-full py-4 rounded-2xl text-base font-bold bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center gap-2 shadow-glow active:scale-95 transition-all">
            <Play size={20} fill="white" /> Iniciar mi recorrido
          </button>
        ) : (
          <button onClick={stop}
            className="w-full py-4 rounded-2xl text-base font-bold bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2 active:scale-95 transition-all">
            <Square size={18} fill="white" /> Detener y finalizar
          </button>
        )}

        <div className="flex items-center justify-center gap-2 mt-4 mb-8 text-xs text-gray-500">
          {running
            ? <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Transmitiendo en vivo — tus seguidores te ven en tiempo real</>
            : <>Al iniciar, mantén esta pantalla abierta durante tu carrera.</>}
        </div>
      </div>
    </div>
  );
}

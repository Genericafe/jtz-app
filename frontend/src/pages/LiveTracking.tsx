import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio, Mic, Square, MapPin, Clock } from 'lucide-react';
import { liveApi } from '../services/api';
import type { MapPoint } from '../components/LiveTrackingMap';

const LiveTrackingMap = lazy(() => import('../components/LiveTrackingMap'));

interface ActiveRunner { runnerId: number; nombre: string; tipo: string; startedAt: string; lastUpdate: string; lat: number | null; lng: number | null; distanciaKm: number }
interface Session { runnerId: number; nombre: string; activo: boolean; lat: number | null; lng: number | null; distanciaKm: number; lastUpdate: string; trail: number[][]; stale: boolean; startedAt: string }

const sinceMin = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

// Bearing (deg) from point a to b — for the runner's direction on the live map.
function bearing(a: MapPoint, b: MapPoint): number {
  const toR = Math.PI / 180, toD = 180 / Math.PI;
  const dLng = (b.lng - a.lng) * toR;
  const la1 = a.lat * toR, la2 = b.lat * toR;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) * toD + 360) % 360;
}
const coachMarker = (() => { try { return localStorage.getItem('jtz_marker') ?? ''; } catch { return ''; } })();

export default function LiveTracking() {
  const [selected, setSelected] = useState<number | null>(null);

  const { data: active } = useQuery({
    queryKey: ['live-active'],
    queryFn: async () => (await liveApi.active()).data as ActiveRunner[],
    refetchInterval: 5000,
  });

  const { data: session } = useQuery({
    queryKey: ['live-session', selected],
    queryFn: async () => (await liveApi.session(selected!)).data as Session,
    enabled: selected != null,
    refetchInterval: 4000,
  });

  // Auto-select the first active runner
  useEffect(() => {
    if (selected == null && active && active.length > 0) setSelected(active[0].runnerId);
  }, [active, selected]);

  const trail: MapPoint[] = (session?.trail ?? []).map(([lng, lat]) => ({ lat, lng }));
  const pos: MapPoint | undefined = session?.lat != null && session?.lng != null
    ? { lat: session.lat, lng: session.lng } : undefined;
  // Runner's heading from the last two trail points
  const liveHeading = trail.length >= 2 ? bearing(trail[trail.length - 2], trail[trail.length - 1]) : null;

  // ── Voice recording ──
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const stopRec = () => { if (mediaRef.current?.state === 'recording') mediaRef.current.stop(); setRecording(false); };

  const startRec = async () => {
    if (selected == null) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 800) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = reader.result as string;
          if (dataUrl.length > 900_000) { alert('Audio muy largo (máx ~10 s)'); return; }
          setSending(true);
          try { await liveApi.sendAudio(selected, dataUrl); setSent(true); setTimeout(() => setSent(false), 2500); }
          catch { alert('No se pudo enviar el audio'); }
          finally { setSending(false); }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setTimeout(() => { if (mediaRef.current?.state === 'recording') stopRec(); }, 10_000); // 10s cap
    } catch { alert('No se pudo acceder al micrófono. Revisa los permisos.'); }
  };

  const selectedRunner = active?.find(a => a.runnerId === selected);

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      <div className="mb-5 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center relative">
          <Radio size={24} className="text-red-400" />
          {active && active.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">En vivo</h1>
          <p className="text-gray-400 text-sm">Sigue a tus corredores en tiempo real</p>
        </div>
      </div>

      {/* Active runners */}
      {!active || active.length === 0 ? (
        <div className="card p-10 text-center">
          <Radio size={36} className="text-gray-600 mx-auto mb-3" />
          <h2 className="text-lg text-white">Nadie está corriendo ahora</h2>
          <p className="text-gray-400 text-sm mt-1">Cuando un corredor inicie una actividad, aparecerá aquí y podrás seguirlo.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {active.map(a => (
              <button key={a.runnerId} onClick={() => setSelected(a.runnerId)}
                className={`flex-shrink-0 px-3.5 py-2.5 rounded-xl border text-left ${selected === a.runnerId ? 'bg-red-500/15 border-red-500/40' : 'bg-surface-700 border-white/[0.06]'}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm text-white whitespace-nowrap">{a.nombre}</span>
                </div>
                <span className="text-[11px] text-gray-500">{a.distanciaKm.toFixed(2)} km · hace {sinceMin(a.lastUpdate)} min</span>
              </button>
            ))}
          </div>

          {/* Live map */}
          <div className="card overflow-hidden mb-4" style={{ height: 380 }}>
            {pos ? (
              <Suspense fallback={<div className="w-full h-full bg-dark-800 flex items-center justify-center text-gray-500 text-sm">Cargando mapa…</div>}>
                <LiveTrackingMap track={trail} currentPos={pos} heading={liveHeading} markerEmoji={coachMarker} className="w-full h-full" />
              </Suspense>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">Esperando ubicación de {selectedRunner?.nombre ?? 'el corredor'}…</div>
            )}
          </div>

          {/* Info + stale warning */}
          {session && (
            <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
              <span className="flex items-center gap-1.5 text-gray-300"><MapPin size={14} className="text-brand-400" /> {session.distanciaKm.toFixed(2)} km</span>
              <span className="flex items-center gap-1.5 text-gray-300"><Clock size={14} className="text-gray-500" /> {sinceMin(session.startedAt)} min activo</span>
              {session.stale && <span className="text-amber-400 text-xs bg-amber-500/10 px-2 py-1 rounded-lg">⚠ Sin señal reciente (posición pausada)</span>}
              {!session.activo && <span className="text-gray-400 text-xs bg-gray-500/10 px-2 py-1 rounded-lg">Actividad finalizada</span>}
            </div>
          )}

          {/* Voice note */}
          <div className="card p-4 flex items-center gap-4">
            <button
              onClick={recording ? stopRec : startRec}
              disabled={sending || selected == null}
              className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${recording ? 'bg-red-500 animate-pulse' : 'bg-brand-500 hover:bg-brand-600'} disabled:opacity-50`}
            >
              {recording ? <Square size={24} className="text-white" fill="white" /> : <Mic size={26} className="text-white" />}
            </button>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">
                {recording ? 'Grabando… toca para enviar' : sending ? 'Enviando…' : sent ? '✓ Audio enviado' : 'Enviar audio de ánimo'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedRunner ? `${selectedRunner.nombre} lo escuchará en unos segundos` : 'Selecciona un corredor'} · máx 10 s
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

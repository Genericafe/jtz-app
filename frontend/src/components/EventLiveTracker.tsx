import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio, Search, MapPin, Clock } from 'lucide-react';
import { publicApi } from '../services/api';
import type { MapPoint } from './LiveTrackingMap';

const LiveTrackingMap = lazy(() => import('./LiveTrackingMap'));

interface LiveParticipant { leadId: number; nombre: string; dorsal: number | null; tipo: string; distanciaKm: number; lastUpdate: string; stale: boolean }
interface Session { leadId: number; nombre: string; dorsal: number | null; activo: boolean; lat: number | null; lng: number | null; distanciaKm: number; startedAt: string; trail: number[][]; stale: boolean }

const sinceMin = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
function bearing(a: MapPoint, b: MapPoint): number {
  const toR = Math.PI / 180, toD = 180 / Math.PI;
  const dLng = (b.lng - a.lng) * toR, la1 = a.lat * toR, la2 = b.lat * toR;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) * toD + 360) % 360;
}

export default function EventLiveTracker({ eventId }: { eventId: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [q, setQ] = useState('');

  const { data: active } = useQuery({
    queryKey: ['event-live', eventId],
    queryFn: async () => (await publicApi.eventLive(eventId)).data as LiveParticipant[],
    refetchInterval: 5000,
  });

  const { data: session } = useQuery({
    queryKey: ['event-live-one', eventId, selected],
    queryFn: async () => (await publicApi.eventLiveOne(eventId, selected!)).data as Session,
    enabled: selected != null,
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (selected == null && active && active.length === 1) setSelected(active[0].leadId);
  }, [active, selected]);

  const term = q.trim().toLowerCase();
  const filtered = (active ?? []).filter(a =>
    a.nombre.toLowerCase().includes(term) || String(a.dorsal ?? '').includes(term));
  const trail: MapPoint[] = (session?.trail ?? []).map(([lng, lat]) => ({ lat, lng }));
  const pos: MapPoint | undefined = session?.lat != null && session?.lng != null ? { lat: session.lat, lng: session.lng } : undefined;
  const heading = trail.length >= 2 ? bearing(trail[trail.length - 2], trail[trail.length - 1]) : null;

  return (
    <div>
      <div className="relative mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Busca por nombre o número de corredor…" className="input w-full pl-9" />
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
      </div>

      {!active || active.length === 0 ? (
        <div className="card p-8 text-center">
          <Radio size={32} className="text-gray-600 mx-auto mb-3" />
          <h3 className="text-white">Aún no hay corredores en vivo</h3>
          <p className="text-gray-400 text-sm mt-1">Cuando los participantes empiecen a marcar su actividad, aparecerán aquí para seguirlos.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {filtered.map(a => (
              <button key={a.leadId} onClick={() => setSelected(a.leadId)}
                className={`flex-shrink-0 px-3.5 py-2.5 rounded-xl border text-left ${selected === a.leadId ? 'bg-red-500/15 border-red-500/40' : 'bg-surface-700 border-white/[0.06]'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${a.stale ? 'bg-gray-500' : 'bg-red-500 animate-pulse'}`} />
                  {a.dorsal != null && <span className="text-[11px] font-bold text-brand-400">#{a.dorsal}</span>}
                  <span className="text-sm text-white whitespace-nowrap">{a.nombre}</span>
                </div>
                <span className="text-[11px] text-gray-500">{a.distanciaKm.toFixed(2)} km · hace {sinceMin(a.lastUpdate)} min</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-gray-500 py-2">Sin coincidencias.</p>}
          </div>

          {selected != null && (
            <>
              <div className="card overflow-hidden mb-4" style={{ height: 400 }}>
                {pos ? (
                  <Suspense fallback={<div className="w-full h-full bg-dark-800 flex items-center justify-center text-gray-500 text-sm">Cargando mapa…</div>}>
                    <LiveTrackingMap track={trail} currentPos={pos} heading={heading} className="w-full h-full" />
                  </Suspense>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">Esperando ubicación…</div>
                )}
              </div>
              {session && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {session.dorsal != null && <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2 py-1 rounded-lg">#{session.dorsal}</span>}
                  <span className="font-bold text-white">{session.nombre}</span>
                  <span className="flex items-center gap-1.5 text-gray-300"><MapPin size={14} className="text-brand-400" /> {session.distanciaKm.toFixed(2)} km</span>
                  <span className="flex items-center gap-1.5 text-gray-300"><Clock size={14} className="text-gray-500" /> {sinceMin(session.startedAt)} min</span>
                  {session.stale && <span className="text-amber-400 text-xs bg-amber-500/10 px-2 py-1 rounded-lg">⚠ Sin señal reciente</span>}
                  {!session.activo && <span className="text-gray-400 text-xs bg-gray-500/10 px-2 py-1 rounded-lg">Finalizado</span>}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

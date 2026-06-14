import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, CheckCircle2, Timer, Clock, Map } from 'lucide-react';
import { parseGpx, TrackPoint, Split } from '../utils/gpxParser';
import { integrationsApi } from '../services/api';

export interface ActivityLog {
  id: number;
  diaId?: number;
  nombre?: string;
  tipo: string;
  fuente: string;
  fecha: string;
  distanciaKm?: number;
  duracionMin?: number;
  tiempoElapsadoMin?: number;
  ritmoMinKm?: number;
  fcPromedio?: number;
  fcMax?: number;
  cadenciaPromedio?: number;
  cadenciaMax?: number;
  elevacionM?: number;
  elevacionPerdidaM?: number;
  caloriasKcal?: number;
  potenciaW?: number;
  potenciaMax?: number;
  potenciaPonderada?: number;
  potenciaPromedio30s?: number;
  confirmadoPorCoach?: boolean;
  confirmedAt?: string;
  gpxContent?: string;
  gpxNombre?: string;
  notas?: string;
  runner?: { id: number; nombre: string; apellido: string };
}

function fmtPace(minKm?: number | null) {
  if (!minKm || minKm <= 0) return null;
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')} /km`;
}

function fmtDuration(min?: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function fmtDurationFull(min?: number | null) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  const s = Math.round((min - Math.floor(min)) * 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} h`;
  return `${m}:${s.toString().padStart(2, '0')} min`;
}

// SVG route map from track points
function RouteMap({ points }: { points: TrackPoint[] }) {
  if (points.length < 2) return null;

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  const W = 600, H = 280, PAD = 18;
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;
  const aspect = lngRange / latRange;
  const useW = Math.min(W - PAD * 2, (H - PAD * 2) * aspect);
  const useH = Math.min(H - PAD * 2, (W - PAD * 2) / aspect);
  const offX = (W - useW) / 2;
  const offY = (H - useH) / 2;

  const toXY = (p: TrackPoint) => ({
    x: offX + ((p.lng - minLng) / lngRange) * useW,
    y: offY + ((maxLat - p.lat) / latRange) * useH,
  });

  const pts = points.map(toXY);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const start = pts[0];
  const end = pts[pts.length - 1];

  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.07] bg-[#0c0f14]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        <rect width={W} height={H} fill="#0c0f14" />
        {/* Grid lines — subtle */}
        {[1, 2, 3].map(i => (
          <line key={`h${i}`} x1={PAD} y1={offY + (useH * i) / 4} x2={W - PAD} y2={offY + (useH * i) / 4}
            stroke="#1e2330" strokeWidth="0.5" />
        ))}
        {/* Route shadow */}
        <path d={d} fill="none" stroke="#dc2626" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.18" />
        {/* Route */}
        <path d={d} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Start */}
        <circle cx={start.x} cy={start.y} r="6" fill="#22c55e" />
        <circle cx={start.x} cy={start.y} r="3" fill="#fff" />
        {/* End */}
        <circle cx={end.x} cy={end.y} r="6" fill="#ef4444" />
        <circle cx={end.x} cy={end.y} r="3" fill="#fff" />
      </svg>
      <div className="flex items-center gap-4 px-4 py-2 border-t border-white/[0.05]">
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" /> Inicio
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" /> Fin
        </span>
      </div>
    </div>
  );
}

// Splits table
function SplitsTable({ splits }: { splits: Split[] }) {
  if (splits.length === 0) return null;
  const hasPower = splits.some(s => s.potenciaW != null);
  const hasHR = splits.some(s => s.fcPromedio != null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="pb-2 text-left font-semibold text-gray-500">Km</th>
            <th className="pb-2 text-right font-semibold text-gray-500">Distancia</th>
            <th className="pb-2 text-right font-semibold text-gray-500">Tiempo</th>
            <th className="pb-2 text-right font-semibold text-gray-500">Ritmo</th>
            {hasHR && <th className="pb-2 text-right font-semibold text-gray-500">FC prom</th>}
            {hasPower && <th className="pb-2 text-right font-semibold text-gray-500">W prom</th>}
          </tr>
        </thead>
        <tbody>
          {splits.map(s => (
            <tr key={s.km} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
              <td className="py-1.5 text-gray-400 font-medium">{s.km}</td>
              <td className="py-1.5 text-right text-gray-300">{s.distanciaKm.toFixed(2)} km</td>
              <td className="py-1.5 text-right text-gray-300">{fmtDurationFull(s.duracionMin)}</td>
              <td className="py-1.5 text-right text-white font-medium">{fmtPace(s.ritmoMinKm) ?? '—'}</td>
              {hasHR && <td className="py-1.5 text-right text-red-400">{s.fcPromedio ? `${s.fcPromedio}` : '—'}</td>}
              {hasPower && <td className="py-1.5 text-right text-yellow-400">{s.potenciaW ? `${s.potenciaW}` : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCell({ label, value, sub, color = 'text-white' }: {
  label: string; value: string | null | undefined; sub?: string; color?: string;
}) {
  if (!value) return null;
  return (
    <div className="bg-surface-700 rounded-xl p-3 border border-white/[0.05]">
      <p className={`text-sm font-black ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

interface Props {
  activity: ActivityLog;
  showGpxDetails?: boolean;
}

export default function ActivityStatsView({ activity: a, showGpxDetails = true }: Props) {
  // Si gpxContent no vino en la respuesta de lista, se carga on-demand
  const [loadGpx, setLoadGpx] = useState(false);

  const { data: fullActivity, isFetching: fetchingGpx } = useQuery({
    queryKey: ['activity-gpx', a.id],
    queryFn: async () => {
      const res = await integrationsApi.getActivity(a.id);
      return res.data as ActivityLog;
    },
    enabled: loadGpx && !a.gpxContent && a.fuente === 'gpx',
    staleTime: Infinity,
  });

  const gpxContent = a.gpxContent ?? fullActivity?.gpxContent;

  const gpxData = useMemo(() => {
    if (!showGpxDetails || !gpxContent) return null;
    try {
      return parseGpx(gpxContent);
    } catch {
      return null;
    }
  }, [gpxContent, showGpxDetails]);

  const trackPoints = gpxData?.trackPoints ?? [];
  const splits = gpxData?.splits ?? [];
  const hasGpxFile = a.fuente === 'gpx';

  const distKm = a.distanciaKm;
  const durMin = a.duracionMin;
  const elapsedMin = a.tiempoElapsadoMin;

  const hasHR = a.fcPromedio != null || a.fcMax != null;
  const hasCad = a.cadenciaPromedio != null || a.cadenciaMax != null;
  const hasPower = a.potenciaW != null || a.potenciaMax != null;
  const hasElev = a.elevacionM != null && a.elevacionM > 0;
  const hasMovingElapsed = durMin != null && elapsedMin != null && Math.abs(elapsedMin - durMin) > 1;

  return (
    <div className="space-y-4">
      {/* Big 3 */}
      {(distKm != null || durMin != null || a.ritmoMinKm != null) && (
        <div className="grid grid-cols-3 gap-3">
          {distKm != null && (
            <div className="bg-surface-700 rounded-xl p-3 text-center border border-white/[0.05]">
              <p className="text-xl font-black text-white">{distKm.toFixed(2)}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 flex items-center justify-center gap-1">
                <MapPin size={10} /> km
              </p>
            </div>
          )}
          {durMin != null && (
            <div className="bg-surface-700 rounded-xl p-3 text-center border border-white/[0.05]">
              <p className="text-xl font-black text-white">{fmtDuration(durMin)}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 flex items-center justify-center gap-1">
                <Clock size={10} /> Duración
              </p>
            </div>
          )}
          {a.ritmoMinKm != null && a.ritmoMinKm > 0 && (
            <div className="bg-surface-700 rounded-xl p-3 text-center border border-white/[0.05]">
              <p className="text-xl font-black text-white">{fmtPace(a.ritmoMinKm)}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 flex items-center justify-center gap-1">
                <Timer size={10} /> Ritmo
              </p>
            </div>
          )}
        </div>
      )}

      {/* Detailed stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {hasMovingElapsed && (
          <>
            <StatCell label="Tiempo activo" value={fmtDurationFull(durMin)} sub="Moving time" />
            <StatCell label="Tiempo total" value={fmtDurationFull(elapsedMin)} sub="Elapsed time" />
          </>
        )}
        {hasHR && (
          <>
            <StatCell label="FC promedio" value={a.fcPromedio ? `${a.fcPromedio} bpm` : null} color="text-red-400" />
            <StatCell label="FC máxima" value={a.fcMax ? `${a.fcMax} bpm` : null} color="text-red-300" />
          </>
        )}
        {hasCad && (
          <>
            <StatCell label="Cadencia prom" value={a.cadenciaPromedio ? `${a.cadenciaPromedio} spm` : null} color="text-teal-400" />
            <StatCell label="Cadencia máx" value={a.cadenciaMax ? `${a.cadenciaMax} spm` : null} color="text-teal-300" />
          </>
        )}
        {hasElev && (
          <>
            <StatCell label="Elevación ganada" value={a.elevacionM ? `${Math.round(a.elevacionM)} m` : null} color="text-blue-400" />
            <StatCell
              label="Elevación perdida"
              value={a.elevacionPerdidaM != null && a.elevacionPerdidaM > 0 ? `${Math.round(a.elevacionPerdidaM)} m` : null}
              color="text-blue-300"
            />
          </>
        )}
        {a.caloriasKcal != null && (
          <StatCell label="Calorías" value={`${a.caloriasKcal} kcal`} color="text-orange-400" />
        )}
        {hasPower && (
          <>
            <StatCell label="Potencia prom" value={a.potenciaW ? `${a.potenciaW} W` : null} color="text-yellow-400" />
            <StatCell label="Potencia máx" value={a.potenciaMax ? `${a.potenciaMax} W` : null} color="text-yellow-300" />
            {a.potenciaPonderada != null && (
              <StatCell label="Potencia ponderada" value={`${a.potenciaPonderada} W`} sub="Normalized Power" color="text-yellow-200" />
            )}
            {a.potenciaPromedio30s != null && (
              <StatCell label="Prom. 30 seg" value={`${a.potenciaPromedio30s} W`} sub="Best 30s avg" color="text-yellow-100" />
            )}
          </>
        )}
      </div>

      {/* Route map */}
      {showGpxDetails && hasGpxFile && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ruta</p>
          {trackPoints.length >= 2 ? (
            <RouteMap points={trackPoints} />
          ) : (
            <button
              onClick={() => setLoadGpx(true)}
              disabled={fetchingGpx}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white hover:border-brand-500/40 hover:bg-brand-500/5 transition-all disabled:opacity-50"
            >
              {fetchingGpx
                ? <><div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" /> Cargando mapa…</>
                : <><Map size={15} /> Ver mapa de la ruta</>
              }
            </button>
          )}
        </div>
      )}

      {/* Splits */}
      {splits.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Parciales por km</p>
          <div className="bg-surface-700 rounded-xl p-3 border border-white/[0.05]">
            <SplitsTable splits={splits} />
          </div>
        </div>
      )}

      {/* Notes */}
      {a.notas && (
        <p className="text-xs text-gray-400 italic px-1">"{a.notas}"</p>
      )}

      {/* Confirmation status */}
      {a.confirmadoPorCoach && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
          <p className="text-xs text-green-400 font-medium">Entrenamiento confirmado por el coach</p>
        </div>
      )}
    </div>
  );
}

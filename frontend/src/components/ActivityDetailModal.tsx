import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  X, TrendingUp, Timer, Heart, Flame, Activity as ActivityIcon,
  ChevronUp, ChevronDown, Zap, MapPin, CheckCircle2,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ── GPX parsing ────────────────────────────────────────────────────────────────

interface TrackPoint { lat: number; lon: number; ele?: number; hr?: number }

function parseGPX(gpxText: string): TrackPoint[] {
  try {
    const doc = new DOMParser().parseFromString(gpxText, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    return Array.from(doc.querySelectorAll('trkpt')).map(pt => {
      const map: Record<string, string> = {};
      for (const el of Array.from(pt.getElementsByTagName('*'))) {
        if (el.textContent && !map[el.localName]) map[el.localName] = el.textContent.trim();
      }
      return {
        lat: parseFloat(pt.getAttribute('lat') ?? '0'),
        lon: parseFloat(pt.getAttribute('lon') ?? '0'),
        ele: map.ele ? parseFloat(map.ele) : undefined,
        hr:  map.hr  ? parseInt(map.hr)    : undefined,
      };
    });
  } catch { return []; }
}

function haversine(p1: { lat: number; lon: number }, p2: { lat: number; lon: number }) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (p2.lat - p1.lat) * d2r, dLon = (p2.lon - p1.lon) * d2r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * d2r) * Math.cos(p2.lat * d2r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── SVG Route Map ──────────────────────────────────────────────────────────────

function RouteMap({ points }: { points: TrackPoint[] }) {
  if (points.length < 3) return null;
  const W = 400, H = 180, pad = 18;
  const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const lonCorr = Math.cos(midLat * Math.PI / 180);
  const latR = maxLat - minLat || 0.001, lonR = (maxLon - minLon || 0.001) * lonCorr;
  const scale = Math.min((W - 2 * pad) / lonR, (H - 2 * pad) / latR);
  const oX = pad + ((W - 2 * pad) - lonR * scale) / 2;
  const oY = pad + ((H - 2 * pad) - latR * scale) / 2;
  const tx = (lon: number) => (oX + (lon - minLon) * lonCorr * scale).toFixed(1);
  const ty = (lat: number) => (H - oY - (lat - minLat) * scale).toFixed(1);
  const step = Math.max(1, Math.floor(points.length / 600));
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.lon)} ${ty(p.lat)}`).join(' ');
  const s0 = pts[0], se = pts[pts.length - 1];
  return (
    <div className="relative rounded-xl overflow-hidden bg-[#0d1117] border border-white/[0.06]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        <path d={path} fill="none" stroke="#22c55e" strokeWidth="5" strokeOpacity="0.12" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={tx(s0.lon)} cy={ty(s0.lat)} r="7" fill="#22c55e" fillOpacity="0.2" />
        <circle cx={tx(s0.lon)} cy={ty(s0.lat)} r="4" fill="#22c55e" />
        <circle cx={tx(se.lon)} cy={ty(se.lat)} r="7" fill="#ef4444" fillOpacity="0.2" />
        <circle cx={tx(se.lon)} cy={ty(se.lat)} r="4" fill="#ef4444" />
      </svg>
      <div className="absolute bottom-2 left-3 flex items-center gap-3">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /><span className="text-[10px] text-gray-500">Inicio</span></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /><span className="text-[10px] text-gray-500">Fin</span></span>
      </div>
    </div>
  );
}

// ── Heart rate zones ───────────────────────────────────────────────────────────

const HR_ZONES = [
  { n: 1, label: 'Recuperación',       min: 0,    max: 0.60, color: '#60a5fa' },
  { n: 2, label: 'Aeróbico base',      min: 0.60, max: 0.70, color: '#34d399' },
  { n: 3, label: 'Aeróbico',           min: 0.70, max: 0.80, color: '#fbbf24' },
  { n: 4, label: 'Umbral anaeróbico',  min: 0.80, max: 0.90, color: '#fb923c' },
  { n: 5, label: 'Máximo',             min: 0.90, max: 1.00, color: '#f87171' },
];

// ── Stat card ──────────────────────────────────────────────────────────────────

function Stat({ icon, val, label }: { icon: ReactNode; val: string; label: string }) {
  return (
    <div className="bg-surface-700 rounded-xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">{icon}{label}</div>
      <p className="text-base font-black text-white leading-none">{val}</p>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  activity: any;
  onClose: () => void;
  onConfirm?: () => void;
  confirming?: boolean;
}

export default function ActivityDetailModal({ activity, onClose, onConfirm, confirming }: Props) {
  const pts = useMemo(() => (activity.gpxContent ? parseGPX(activity.gpxContent) : []), [activity.gpxContent]);

  const { gainM, lossM, gpxDistKm, elevData, hrChart } = useMemo(() => {
    if (pts.length < 2) return { gainM: 0, lossM: 0, gpxDistKm: 0, elevData: [], hrChart: [] };
    let gain = 0, loss = 0, dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += haversine(pts[i - 1], pts[i]);
      if (pts[i].ele != null && pts[i - 1].ele != null) {
        const diff = pts[i].ele! - pts[i - 1].ele!;
        if (diff > 0.5) gain += diff; else if (diff < -0.5) loss += Math.abs(diff);
      }
    }
    const step = Math.max(1, Math.floor(pts.length / 220));
    const elevData: { d: number; m: number }[] = [];
    const hrChart: { d: number; bpm: number }[] = [];
    let cumD = 0;
    for (let i = 0; i < pts.length; i += step) {
      if (i > 0) cumD += haversine(pts[Math.max(0, i - step)], pts[i]);
      const d = +cumD.toFixed(2);
      if (pts[i].ele != null) elevData.push({ d, m: Math.round(pts[i].ele!) });
      if (pts[i].hr  != null) hrChart.push({ d, bpm: pts[i].hr! });
    }
    return { gainM: Math.round(gain), lossM: Math.round(loss), gpxDistKm: dist, elevData, hrChart };
  }, [pts]);

  const distKm  = activity.distanciaKm  ?? gpxDistKm;
  const elevGain = activity.elevacionM       ?? gainM;
  const elevLoss = activity.elevacionPerdidaM ?? lossM;
  const hrMax   = activity.fcMax ?? 190;
  const hrAvg   = activity.fcPromedio;
  const activeZone = hrAvg != null
    ? HR_ZONES.findIndex(z => hrAvg >= z.min * hrMax && hrAvg < z.max * hrMax)
    : -1;

  const pace = activity.ritmoMinKm;
  const paceStr = pace
    ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km`
    : null;

  const tooltipStyle = {
    background: '#1e2433', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', fontSize: '11px', padding: '4px 8px',
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-800 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col border border-white/[0.08] shadow-2xl">

        {/* Header */}
        <div className="flex-shrink-0 flex items-start justify-between px-4 py-3 lg:px-5 lg:py-4 border-b border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-white">{activity.nombre || activity.tipo}</h2>
              <span className="badge bg-brand-500/15 text-brand-400 capitalize text-[10px]">{activity.tipo}</span>
              {activity.confirmadoPorCoach && (
                <span className="badge bg-green-500/15 text-green-400 text-[10px] flex items-center gap-1">
                  <CheckCircle2 size={9} /> Confirmado
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {format(new Date(activity.fecha), "EEEE d MMM yyyy · HH:mm", { locale: es })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all ml-2 flex-shrink-0 -mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-5">

          {/* GPS Map */}
          {pts.length >= 3 && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Ruta GPS
              </p>
              <RouteMap points={pts} />
            </div>
          )}

          {/* Metrics grid */}
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Métricas</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {distKm > 0 && (
                <Stat icon={<TrendingUp size={12} className="text-brand-400" />} val={`${Number(distKm).toFixed(2)} km`} label="Distancia" />
              )}
              {activity.duracionMin != null && (
                <Stat icon={<Timer size={12} className="text-blue-400" />} val={`${activity.duracionMin} min`} label="Duración" />
              )}
              {paceStr && (
                <Stat icon={<ActivityIcon size={12} className="text-purple-400" />} val={paceStr} label="Ritmo" />
              )}
              {hrAvg != null && (
                <Stat icon={<Heart size={12} className="text-red-400" />} val={`${hrAvg} bpm`} label="FC promedio" />
              )}
              {activity.fcMax != null && (
                <Stat icon={<Heart size={12} className="text-red-500" />} val={`${activity.fcMax} bpm`} label="FC máxima" />
              )}
              {elevGain > 0 && (
                <Stat icon={<ChevronUp size={12} className="text-green-400" />} val={`${Math.round(elevGain)} m`} label="Desnivel +" />
              )}
              {elevLoss > 0 && (
                <Stat icon={<ChevronDown size={12} className="text-yellow-400" />} val={`${Math.round(elevLoss)} m`} label="Desnivel −" />
              )}
              {activity.caloriasKcal != null && (
                <Stat icon={<Flame size={12} className="text-orange-400" />} val={`${activity.caloriasKcal} kcal`} label="Calorías" />
              )}
              {activity.cadenciaPromedio != null && (
                <Stat icon={<span className="text-[10px] font-black text-purple-400">spm</span>} val={`${activity.cadenciaPromedio}`} label="Cadencia prom." />
              )}
              {activity.potenciaW != null && (
                <Stat icon={<Zap size={12} className="text-yellow-400" />} val={`${activity.potenciaW} W`} label="Potencia prom." />
              )}
            </div>
          </div>

          {/* Elevation profile */}
          {elevData.length >= 5 && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Altimetría</p>
              <div className="bg-surface-900 rounded-xl px-3 pt-3 pb-1 border border-white/[0.04]">
                <ResponsiveContainer width="100%" height={90}>
                  <AreaChart data={elevData}>
                    <defs>
                      <linearGradient id="gEle" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="d" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v) => [`${v} m`, 'Alt.']}
                      labelFormatter={(l) => `${l} km`}
                    />
                    <Area type="monotone" dataKey="m" stroke="#22c55e" fill="url(#gEle)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* HR chart from GPX */}
          {hrChart.length >= 5 && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Frecuencia cardiaca</p>
              <div className="bg-surface-900 rounded-xl px-3 pt-3 pb-1 border border-white/[0.04]">
                <ResponsiveContainer width="100%" height={90}>
                  <AreaChart data={hrChart}>
                    <defs>
                      <linearGradient id="gHr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="d" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v) => [`${v} bpm`, 'FC']}
                      labelFormatter={(l) => `${l} km`}
                    />
                    <Area type="monotone" dataKey="bpm" stroke="#ef4444" fill="url(#gHr)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Heart rate zones */}
          {hrAvg != null && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                Zonas de FC
                <span className="text-gray-700 font-normal normal-case tracking-normal ml-2">
                  FC máx: {hrMax} bpm
                </span>
              </p>
              <div className="space-y-1.5">
                {HR_ZONES.map((z, i) => {
                  const active = activeZone === i;
                  const bpmMin = Math.max(50, Math.round(z.min * hrMax));
                  const bpmMax = i === 4 ? hrMax : Math.round(z.max * hrMax);
                  return (
                    <div key={z.n} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${active ? 'bg-surface-700' : ''}`}>
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0"
                        style={{ background: `${z.color}18`, color: z.color }}
                      >
                        {z.n}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <span className={`text-xs truncate ${active ? 'text-white font-semibold' : 'text-gray-500'}`}>
                            Z{z.n} · {z.label}
                          </span>
                          <span className="text-[10px] flex-shrink-0" style={{ color: active ? z.color : '#4b5563' }}>
                            {i === 0 ? `< ${bpmMax}` : `${bpmMin}–${bpmMax}`} bpm
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: active ? z.color : `${z.color}20` }} />
                      </div>
                      {active && (
                        <span className="text-[10px] font-black flex-shrink-0" style={{ color: z.color }}>
                          ← {hrAvg} bpm
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {activity.notas && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Notas</p>
              <p className="text-sm text-gray-300 p-3 bg-surface-900 rounded-xl leading-relaxed">{activity.notas}</p>
            </div>
          )}

          {/* Confirm button */}
          {!activity.confirmadoPorCoach && onConfirm && (
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="w-full btn-primary py-3 text-sm font-bold flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} />
              {confirming ? 'Confirmando...' : 'Confirmar actividad'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

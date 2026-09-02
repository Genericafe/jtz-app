import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Route, Clock, Mountain, Flame, Activity, BarChart3 } from 'lucide-react';
import { trainingApi } from '../services/api';

interface Totals { distanceKm: number; durationMin: number; elevationM: number; tss: number; activities: number; calorias: number }
interface Weekly { week: string; distanceKm: number; durationMin: number; tss: number; elevationM: number; activities: number }
interface ByType { tipo: string; distanceKm: number; durationMin: number; count: number }
interface HrZone { zone: number; label: string; minutes: number }

const TYPE_COLOR: Record<string, string> = {
  correr: '#1f6bff', trail: '#22c55e', ciclismo: '#a855f7', natacion: '#06b6d4', otro: '#94a3b8',
};
const ZONE_COLOR = ['#94a3b8', '#38bdf8', '#22c55e', '#eab308', '#f97316', '#ef4444'];
const METRICS = [
  { id: 'distanceKm', label: 'Distancia', unit: 'km' },
  { id: 'durationMin', label: 'Tiempo', unit: 'min' },
  { id: 'tss', label: 'Carga (TSS)', unit: '' },
  { id: 'elevationM', label: 'Desnivel', unit: 'm' },
] as const;
const WEEK_OPTS = [4, 12, 26];
const fmtDur = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;

export default function AnalyticsPanel({ runnerId }: { runnerId: number | null }) {
  const [weeks, setWeeks] = useState(12);
  const [metric, setMetric] = useState<typeof METRICS[number]['id']>('distanceKm');

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', runnerId, weeks],
    queryFn: async () => (await trainingApi.analytics({ runnerId: runnerId ?? undefined, weeks })).data as
      { totals: Totals | null; weekly: Weekly[]; byType: ByType[]; hrZones: HrZone[] },
  });

  const totals = data?.totals;
  const hasHr = (data?.hrZones ?? []).some(z => z.minutes > 0);
  const metricMeta = METRICS.find(m => m.id === metric)!;

  if (isLoading) return <p className="text-gray-500 py-16 text-center">Cargando…</p>;
  if (!totals || totals.activities === 0) {
    return (
      <div className="card p-10 text-center">
        <Activity size={36} className="text-gray-600 mx-auto mb-3" />
        <p className="text-white">Sin actividades en este periodo</p>
        <p className="text-gray-500 text-sm mt-1">Registra entrenamientos para ver la analítica.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {WEEK_OPTS.map(w => (
          <button key={w} onClick={() => setWeeks(w)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${weeks === w ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40' : 'bg-surface-700 text-gray-400'}`}>{w} sem</button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Kpi icon={Route} label="Distancia" value={`${totals.distanceKm} km`} />
        <Kpi icon={Clock} label="Tiempo" value={fmtDur(totals.durationMin)} />
        <Kpi icon={Mountain} label="Desnivel+" value={`${totals.elevationM} m`} />
        <Kpi icon={BarChart3} label="Carga total" value={`${totals.tss} TSS`} />
        <Kpi icon={Activity} label="Actividades" value={`${totals.activities}`} />
        <Kpi icon={Flame} label="Calorías" value={totals.calorias > 0 ? `${totals.calorias}` : '—'} />
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Volumen semanal</h2>
          <div className="flex gap-1.5">
            {METRICS.map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${metric === m.id ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-600 text-gray-400'}`}>{m.label}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data!.weekly} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={20} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
            <Tooltip contentStyle={{ background: '#111829', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }} formatter={(v: number) => [`${v} ${metricMeta.unit}`, metricMeta.label]} />
            <Bar dataKey={metric} fill="#1f6bff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-4">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-3">Por disciplina (tiempo)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data!.byType} dataKey="durationMin" nameKey="tipo" cx="50%" cy="50%" outerRadius={72} innerRadius={42}>
                {data!.byType.map(t => <Cell key={t.tipo} fill={TYPE_COLOR[t.tipo] ?? '#94a3b8'} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#111829', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 12 }}
                formatter={(v: number, n: string) => [fmtDur(v), n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {data!.byType.map(t => (
              <span key={t.tipo} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span className="w-2.5 h-2.5 rounded" style={{ background: TYPE_COLOR[t.tipo] ?? '#94a3b8' }} />
                {t.tipo} · {t.distanceKm} km
              </span>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-1">Tiempo por zona de FC</h2>
          <p className="text-[11px] text-gray-500 mb-3">Aproximado según la FC promedio de cada sesión</p>
          {!hasHr ? (
            <p className="text-gray-500 text-sm py-12 text-center">Sin datos de frecuencia cardiaca.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart layout="vertical" data={data!.hrZones} margin={{ top: 4, right: 10, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} width={100} />
                <Tooltip contentStyle={{ background: '#111829', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => [fmtDur(v), 'Tiempo']} cursor={{ fill: '#ffffff08' }} />
                <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                  {data!.hrZones.map(z => <Cell key={z.zone} fill={ZONE_COLOR[z.zone]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={14} className="text-brand-400" />
        <span className="text-[11px] text-gray-400">{label}</span>
      </div>
      <p className="text-xl font-bold text-white leading-none">{value}</p>
    </div>
  );
}

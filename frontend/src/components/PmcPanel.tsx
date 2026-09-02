import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Activity, Zap, Gauge } from 'lucide-react';
import { trainingApi } from '../services/api';

interface PmcPoint { date: string; tss: number; ctl: number; atl: number; tsb: number }

export function formState(tsb: number): { label: string; color: string } {
  if (tsb > 15) return { label: 'Muy fresco (desentrenando)', color: '#60a5fa' };
  if (tsb >= 5) return { label: 'Fresco · listo para competir', color: '#22c55e' };
  if (tsb >= -10) return { label: 'Neutral · entrenando', color: '#a3a3a3' };
  if (tsb >= -30) return { label: 'Cansado · buena carga', color: '#f59e0b' };
  return { label: 'Muy fatigado · cuidado', color: '#ef4444' };
}

const DAY_OPTS = [42, 90, 180];

export default function PmcPanel({ runnerId }: { runnerId: number | null }) {
  const [days, setDays] = useState(90);

  const { data, isLoading } = useQuery({
    queryKey: ['pmc', runnerId, days],
    queryFn: async () =>
      (await trainingApi.pmc({ runnerId: runnerId ?? undefined, days })).data as
        { series: PmcPoint[]; current: { ctl: number; atl: number; tsb: number } },
  });

  const cur = data?.current ?? { ctl: 0, atl: 0, tsb: 0 };
  const form = formState(cur.tsb);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Metric icon={Activity} label="Condición física" sub="CTL · fitness" value={cur.ctl} color="#60a5fa" />
        <Metric icon={Zap} label="Fatiga" sub="ATL · fatiga" value={cur.atl} color="#f472b6" />
        <Metric icon={Gauge} label="Forma" sub={form.label} value={cur.tsb} color={form.color} signed />
      </div>

      <div className="flex gap-2 mb-3">
        {DAY_OPTS.map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${days === d ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40' : 'bg-surface-700 text-gray-400'}`}>
            {d} días
          </button>
        ))}
      </div>

      <div className="card p-4">
        {isLoading ? (
          <p className="text-gray-500 text-sm py-16 text-center">Cargando…</p>
        ) : !data?.series.length ? (
          <p className="text-gray-500 text-sm py-16 text-center">Aún no hay actividades suficientes para calcular la carga.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.series} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={{ background: '#111829', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }} />
              <ReferenceLine yAxisId="r" y={0} stroke="#ffffff22" />
              <Area yAxisId="l" type="monotone" dataKey="ctl" name="Condición (CTL)" stroke="#60a5fa" fill="#60a5fa22" strokeWidth={2} />
              <Line yAxisId="l" type="monotone" dataKey="atl" name="Fatiga (ATL)" stroke="#f472b6" strokeWidth={1.5} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="tsb" name="Forma (TSB)" stroke="#22c55e" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <div className="flex flex-wrap gap-4 justify-center mt-3 text-[11px]">
          <Legend color="#60a5fa" label="Condición física (CTL)" />
          <Legend color="#f472b6" label="Fatiga (ATL)" />
          <Legend color="#22c55e" label="Forma (TSB)" />
        </div>
      </div>

      <p className="text-[11px] text-gray-600 mt-3 leading-relaxed">
        La <strong className="text-gray-400">carga (TSS)</strong> se estima con la duración e intensidad (FC) de cada sesión.
        La <strong className="text-gray-400">condición física</strong> sube con entrenamiento constante; la <strong className="text-gray-400">fatiga</strong> refleja la carga reciente;
        la <strong className="text-gray-400">forma</strong> alta indica frescura para competir, muy negativa indica fatiga acumulada.
      </p>
    </div>
  );
}

function Metric({ icon: Icon, label, sub, value, color, signed }: {
  icon: any; label: string; sub: string; value: number; color: string; signed?: boolean;
}) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={14} style={{ color }} />
        <span className="text-[11px] text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white leading-none">{signed && value > 0 ? '+' : ''}{value}</p>
      <p className="text-[10px] text-gray-500 mt-1 leading-tight">{sub}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-gray-400">
      <span className="w-3 h-1 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

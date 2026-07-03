import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Lock } from 'lucide-react';
import { gamificationApi } from '../services/api';

interface Badge {
  id: string;
  category: 'km' | 'elevacion' | 'distancia' | 'racha_dias' | 'racha_semanas' | 'ciudades';
  threshold: number;
  nombre: string;
  descripcion: string;
  icon: string;
  earned: boolean;
  earnedAt: string | null;
}
interface Stats {
  totalKm: number; totalElev: number; longestRunKm: number;
  cities: number; maxDayStreak: number; maxWeekStreak: number;
}

const CATEGORY_META: Record<Badge['category'], { label: string; value: (s: Stats) => number; unit: string }> = {
  km:            { label: 'Distancia acumulada', value: s => s.totalKm,       unit: 'km' },
  elevacion:     { label: 'Desnivel acumulado',  value: s => s.totalElev,     unit: 'm' },
  distancia:     { label: 'Carrera más larga',   value: s => s.longestRunKm,  unit: 'km' },
  racha_dias:    { label: 'Racha de días',       value: s => s.maxDayStreak,  unit: 'días' },
  racha_semanas: { label: 'Racha de semanas',    value: s => s.maxWeekStreak, unit: 'sem' },
  ciudades:      { label: 'Ciudades distintas',  value: s => s.cities,        unit: '' },
};
const CATEGORY_ORDER: Badge['category'][] = ['km', 'distancia', 'elevacion', 'racha_dias', 'racha_semanas', 'ciudades'];

export default function Badges() {
  const { data, isLoading } = useQuery({
    queryKey: ['badges-me'],
    queryFn: async () => (await gamificationApi.badges()).data as { stats: Stats | null; badges: Badge[] },
  });

  const stats = data?.stats;
  const badges = data?.badges ?? [];
  const earnedCount = badges.filter(b => b.earned).length;

  const grouped = useMemo(() => {
    const g: Record<string, Badge[]> = {};
    for (const b of badges) (g[b.category] ??= []).push(b);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.threshold - b.threshold);
    return g;
  }, [badges]);

  if (isLoading) return <div className="p-4 lg:p-8 text-gray-400">Cargando logros…</div>;

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-yellow-500/15 flex items-center justify-center">
          <Trophy size={24} className="text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Mis logros</h1>
          <p className="text-gray-400 text-sm">
            {earnedCount} de {badges.length} insignias desbloqueadas
          </p>
        </div>
      </div>

      {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => {
        const meta = CATEGORY_META[cat];
        const current = stats ? meta.value(stats) : 0;
        const next = grouped[cat].find(b => !b.earned);
        return (
          <section key={cat} className="mb-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">{meta.label}</h2>
              <span className="text-xs text-gray-500">
                {cat === 'elevacion' || cat === 'km' || cat === 'distancia'
                  ? current.toFixed(cat === 'elevacion' ? 0 : 1) : current}{meta.unit ? ` ${meta.unit}` : ''}
                {next && ` · próxima a ${next.threshold}${meta.unit ? ` ${meta.unit}` : ''}`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {grouped[cat].map(b => {
                const pct = Math.min(100, Math.round((current / b.threshold) * 100));
                return (
                  <div
                    key={b.id}
                    className={`rounded-2xl p-4 border text-center transition-all ${
                      b.earned
                        ? 'bg-dark-800 border-yellow-500/40 shadow-lg shadow-yellow-500/5'
                        : 'bg-dark-900 border-dark-700 opacity-80'
                    }`}
                  >
                    <div className={`text-4xl mb-1.5 ${b.earned ? '' : 'grayscale opacity-40'}`}>{b.icon}</div>
                    <div className={`text-sm font-bold ${b.earned ? 'text-white' : 'text-gray-400'}`}>{b.nombre}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{b.descripcion}</div>
                    {b.earned ? (
                      <div className="mt-2 text-[10px] text-yellow-400 font-semibold uppercase tracking-wide">Desbloqueada</div>
                    ) : (
                      <div className="mt-2">
                        <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-gray-500">
                          <Lock size={9} /> {pct}%
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

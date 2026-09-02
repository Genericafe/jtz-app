import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { trainingApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PmcPanel, { formState } from '../components/PmcPanel';
import AnalyticsPanel from '../components/AnalyticsPanel';

interface Overview { runnerId: number; nombre: string; ctl: number; atl: number; tsb: number }

export default function Performance() {
  const { isCoach } = useAuth();
  const [runnerId, setRunnerId] = useState<number | null>(null);
  const [tab, setTab] = useState<'forma' | 'analitica'>('forma');

  const { data: overview } = useQuery({
    queryKey: ['pmc-overview'],
    queryFn: async () => (await trainingApi.overview()).data as Overview[],
    enabled: isCoach,
  });

  const selectedName = runnerId ? overview?.find(o => o.runnerId === runnerId)?.nombre : null;

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-brand-500/15 flex items-center justify-center">
          <TrendingUp size={24} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Rendimiento</h1>
          <p className="text-gray-400 text-sm">Forma y analítica {selectedName ? `· ${selectedName}` : ''}</p>
        </div>
      </div>

      {/* Coach: runner selector */}
      {isCoach && overview && overview.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Corredor</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button onClick={() => setRunnerId(null)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border ${runnerId === null ? 'bg-brand-500/15 border-brand-500/40 text-white' : 'bg-surface-700 border-white/[0.06] text-gray-400'}`}>
              Yo
            </button>
            {overview.map(o => {
              const f = formState(o.tsb);
              return (
                <button key={o.runnerId} onClick={() => setRunnerId(o.runnerId)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-left border ${runnerId === o.runnerId ? 'bg-brand-500/15 border-brand-500/40' : 'bg-surface-700 border-white/[0.06]'}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: f.color }} />
                    <span className="text-xs text-white whitespace-nowrap">{o.nombre}</span>
                  </div>
                  <span className="text-[10px] text-gray-500">Forma {o.tsb > 0 ? '+' : ''}{o.tsb}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([['forma', 'Forma'], ['analitica', 'Analítica']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === id ? 'bg-brand-500 text-white' : 'bg-surface-700 text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'forma' ? <PmcPanel runnerId={runnerId} /> : <AnalyticsPanel runnerId={runnerId} />}
    </div>
  );
}

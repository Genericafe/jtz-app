import { Flame, Snowflake, Zap, Pause, Repeat } from 'lucide-react';
import { type Estructura, type StepTipo, TIPO_LABEL, fmtValor, totales } from '../utils/intervals';

const ICON: Record<StepTipo, JSX.Element> = {
  calentamiento: <Flame size={12} className="text-amber-400" />,
  trabajo:       <Zap size={12} className="text-brand-400" />,
  descanso:      <Pause size={12} className="text-gray-400" />,
  enfriamiento:  <Snowflake size={12} className="text-sky-400" />,
};

export default function WorkoutStructureView({ estructura }: { estructura: Estructura }) {
  if (!estructura.length) return null;
  const t = totales(estructura);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-surface-800/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Workout por intervalos</p>
        <p className="text-[11px] text-gray-500">
          {t.km > 0 && <>≈ {t.km.toFixed(t.km % 1 === 0 ? 0 : 2)} km </>}
          {t.min > 0 && <>· {Math.round(t.min)} min mín.</>}
        </p>
      </div>
      <div className="space-y-1.5">
        {estructura.map((seg, i) => seg.kind === 'step' ? (
          <div key={i} className="flex items-center gap-2 text-sm">
            {ICON[seg.tipo]}
            <span className="text-gray-300">{TIPO_LABEL[seg.tipo]}</span>
            <span className="text-white font-semibold ml-auto">{fmtValor(seg)}</span>
          </div>
        ) : (
          <div key={i} className="rounded-lg bg-brand-500/[0.08] border border-brand-500/20 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-brand-300 mb-1">
              <Repeat size={12} /> {seg.veces} series
            </div>
            <div className="space-y-1 pl-1">
              {seg.pasos.map((p, pi) => (
                <div key={pi} className="flex items-center gap-2 text-sm">
                  {ICON[p.tipo]}
                  <span className="text-gray-300">{TIPO_LABEL[p.tipo]}</span>
                  <span className="text-white font-semibold ml-auto">{fmtValor(p)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

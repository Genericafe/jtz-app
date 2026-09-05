import { useEffect, useState } from 'react';
import { Plus, Trash2, Repeat, Flame, Snowflake, Zap, Pause } from 'lucide-react';
import {
  type Estructura, type Segment, type Step, type StepModo, type StepTipo,
  fmtTiempo, parseTiempo, TIPO_LABEL, resumen,
} from '../utils/intervals';

const TIPO_ICON: Record<StepTipo, { icon: JSX.Element; color: string }> = {
  calentamiento: { icon: <Flame size={13} />,     color: 'text-amber-400' },
  trabajo:       { icon: <Zap size={13} />,        color: 'text-brand-400' },
  descanso:      { icon: <Pause size={13} />,      color: 'text-gray-400' },
  enfriamiento:  { icon: <Snowflake size={13} />,  color: 'text-sky-400' },
};

// mm:ss text field that commits seconds on blur (no cursor jump).
function TimeField({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const [txt, setTxt] = useState(fmtTiempo(seconds));
  useEffect(() => { setTxt(fmtTiempo(seconds)); }, [seconds]);
  return (
    <input value={txt} onChange={e => setTxt(e.target.value)} onBlur={() => onChange(parseTiempo(txt))}
      placeholder="mm:ss"
      className="w-20 bg-surface-600 border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-brand-500/60" />
  );
}

// One editable step row (tipo / modo / valor / delete).
function StepRow({ step, onChange, onDelete, lockTipo }: {
  step: Step; onChange: (s: Step) => void; onDelete?: () => void; lockTipo?: boolean;
}) {
  const ic = TIPO_ICON[step.tipo];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`flex items-center gap-1 ${ic.color}`}>{ic.icon}</span>
      {lockTipo ? (
        <span className="text-xs font-semibold text-white w-24">{TIPO_LABEL[step.tipo]}</span>
      ) : (
        <select value={step.tipo} onChange={e => onChange({ ...step, tipo: e.target.value as StepTipo })}
          className="bg-surface-600 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500/60">
          {(['calentamiento','trabajo','descanso','enfriamiento'] as StepTipo[]).map(t =>
            <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
        </select>
      )}
      <select value={step.modo} onChange={e => onChange({ ...step, modo: e.target.value as StepModo })}
        className="bg-surface-600 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500/60">
        <option value="distancia">Distancia</option>
        <option value="tiempo">Tiempo</option>
      </select>
      {step.modo === 'distancia' ? (
        <div className="flex items-center gap-1">
          <input type="number" min={0} value={step.valor}
            onChange={e => onChange({ ...step, valor: Number(e.target.value) })}
            className="w-20 bg-surface-600 border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-brand-500/60" />
          <span className="text-xs text-gray-500">m</span>
        </div>
      ) : (
        <TimeField seconds={step.valor} onChange={s => onChange({ ...step, valor: s })} />
      )}
      {onDelete && (
        <button onClick={onDelete} className="ml-auto p-1 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
      )}
    </div>
  );
}

export default function IntervalBuilder({ value, onChange }: { value: Estructura; onChange: (e: Estructura) => void }) {
  const set = (next: Estructura) => onChange(next);
  const patch = (i: number, seg: Segment) => set(value.map((s, idx) => idx === i ? seg : s));
  const remove = (i: number) => set(value.filter((_, idx) => idx !== i));

  const addStep = (tipo: StepTipo) =>
    set([...value, { kind: 'step', tipo, modo: 'tiempo', valor: 600 }]);
  const addRepeat = () =>
    set([...value, { kind: 'repeat', veces: 10, pasos: [
      { tipo: 'trabajo', modo: 'distancia', valor: 400 },
      { tipo: 'descanso', modo: 'tiempo', valor: 150 },
    ] }]);

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-gray-500">Sin intervalos. Agrega bloques abajo para crear un workout guiado (ej. 10×400 m con 2:30 de descanso).</p>
      )}

      {value.map((seg, i) => (
        <div key={i} className="rounded-xl border border-white/[0.08] bg-surface-700 p-3">
          {seg.kind === 'step' ? (
            <StepRow step={seg} onChange={s => patch(i, { kind: 'step', ...s })} onDelete={() => remove(i)} />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Repeat size={14} className="text-brand-400" />
                <input type="number" min={1} max={60} value={seg.veces}
                  onChange={e => patch(i, { ...seg, veces: Math.max(1, Number(e.target.value)) })}
                  className="w-16 bg-surface-600 border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm text-white text-center font-bold focus:outline-none focus:border-brand-500/60" />
                <span className="text-xs text-gray-400">series de:</span>
                <button onClick={() => remove(i)} className="ml-auto p-1 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
              </div>
              <div className="space-y-2 pl-6 border-l-2 border-brand-500/30">
                {seg.pasos.map((p, pi) => (
                  <StepRow key={pi} step={p}
                    onChange={s => patch(i, { ...seg, pasos: seg.pasos.map((x, xi) => xi === pi ? s : x) })}
                    onDelete={seg.pasos.length > 1 ? () => patch(i, { ...seg, pasos: seg.pasos.filter((_, xi) => xi !== pi) }) : undefined} />
                ))}
                <button onClick={() => patch(i, { ...seg, pasos: [...seg.pasos, { tipo: 'trabajo', modo: 'distancia', valor: 200 }] })}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1">
                  <Plus size={11} /> paso dentro de la serie
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => addStep('calentamiento')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.1] text-xs text-gray-300 hover:text-white hover:border-white/25 transition-colors">
          <Flame size={12} className="text-amber-400" /> Calentamiento
        </button>
        <button onClick={addRepeat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/15 border border-brand-500/30 text-xs text-brand-300 font-semibold hover:bg-brand-500/25 transition-colors">
          <Repeat size={12} /> Serie de intervalos
        </button>
        <button onClick={() => addStep('enfriamiento')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.1] text-xs text-gray-300 hover:text-white hover:border-white/25 transition-colors">
          <Snowflake size={12} className="text-sky-400" /> Enfriamiento
        </button>
      </div>

      {value.length > 0 && (
        <p className="text-[11px] text-gray-500 pt-1">Resumen: <span className="text-gray-300">{resumen(value)}</span></p>
      )}
    </div>
  );
}

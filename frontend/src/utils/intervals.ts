// Structured interval workouts: data model + helpers shared by the coach
// builder, the read-only view, and the runner's guided player.

export type StepTipo = 'calentamiento' | 'trabajo' | 'descanso' | 'enfriamiento';
export type StepModo = 'distancia' | 'tiempo';

export interface Step {
  tipo: StepTipo;
  modo: StepModo;
  valor: number;   // metros si modo='distancia', segundos si modo='tiempo'
  nota?: string;
}

export type Segment =
  | ({ kind: 'step' } & Step)
  | { kind: 'repeat'; veces: number; pasos: Step[] };

export type Estructura = Segment[];

export interface FlatStep extends Step {
  serie?: number;        // 1-based within a repeat block
  totalSeries?: number;  // repeat count
}

export const TIPO_LABEL: Record<StepTipo, string> = {
  calentamiento: 'Calentamiento',
  trabajo:       'Trabajo',
  descanso:      'Descanso',
  enfriamiento:  'Enfriamiento',
};

// Safe parse from the DB JSON string.
export function parseEstructura(json?: string | null): Estructura {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as Estructura) : [];
  } catch { return []; }
}

export function hasEstructura(json?: string | null): boolean {
  return parseEstructura(json).length > 0;
}

// Expand repeat blocks into an ordered list of concrete steps.
export function flatten(est: Estructura): FlatStep[] {
  const out: FlatStep[] = [];
  for (const seg of est) {
    if (seg.kind === 'step') {
      out.push({ tipo: seg.tipo, modo: seg.modo, valor: seg.valor, nota: seg.nota });
    } else {
      for (let i = 0; i < seg.veces; i++) {
        for (const p of seg.pasos) {
          out.push({ ...p, serie: i + 1, totalSeries: seg.veces });
        }
      }
    }
  }
  return out;
}

// "2:30" from 150 seconds; "0:45" from 45.
export function fmtTiempo(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Parse "2:30" / "150" / "1:05" into seconds.
export function parseTiempo(txt: string): number {
  const t = txt.trim();
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    return (Number(m) || 0) * 60 + (Number(s) || 0);
  }
  return Number(t) || 0;
}

// Short value label for one step, e.g. "400 m" or "2:30".
export function fmtValor(step: { modo: StepModo; valor: number }): string {
  if (step.modo === 'distancia') {
    return step.valor >= 1000 ? `${(step.valor / 1000).toFixed(step.valor % 1000 === 0 ? 0 : 2)} km` : `${step.valor} m`;
  }
  return fmtTiempo(step.valor);
}

// One-line human summary: "10 min cal · 10×(400 m / 2:30) · 10 min enf".
export function resumen(est: Estructura): string {
  const parts = est.map(seg => {
    if (seg.kind === 'step') return `${fmtValor(seg)} ${seg.tipo.slice(0, 3)}`;
    const inner = seg.pasos.map(fmtValor).join(' / ');
    return `${seg.veces}×(${inner})`;
  });
  return parts.join(' · ');
}

// Total planned distance (km) and time (min) for quick stats.
export function totales(est: Estructura): { km: number; min: number } {
  let m = 0, s = 0;
  for (const step of flatten(est)) {
    if (step.modo === 'distancia') m += step.valor;
    else s += step.valor;
  }
  return { km: m / 1000, min: s / 60 };
}

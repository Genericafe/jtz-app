import { PrismaClient } from '@prisma/client';

// Training load à la TrainingPeaks — computed live from stored activity data, no
// schema change. TSS is estimated (no per-athlete FTP/threshold), primarily from
// heart-rate intensity, so it works across athletes and on historical data.

interface ActivityRow {
  fecha: Date;
  duracionMin: number | null;
  tiempoElapsadoMin: number | null;
  fcPromedio: number | null;
  fcMax: number | null;
  distanciaKm: number | null;
  ritmoMinKm: number | null;
  tipo: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Estimated Training Stress Score for one activity (~100 = 1h at threshold). */
export function computeTSS(a: ActivityRow): number {
  const durHr = (a.duracionMin ?? a.tiempoElapsadoMin ?? 0) / 60;
  if (durHr <= 0) return 0;

  let intensity: number; // Intensity Factor: ~0.5 easy, ~0.85 threshold, ~1.05 hard
  if (a.fcPromedio && a.fcMax && a.fcMax > 0) {
    // Threshold HR ≈ 90% of max → IF 1.0
    intensity = clamp((a.fcPromedio / a.fcMax) / 0.90, 0.45, 1.15);
  } else if (a.fcPromedio) {
    intensity = clamp((a.fcPromedio / 190) / 0.90, 0.45, 1.15); // assume max ~190
  } else {
    // No HR — moderate default, nudged by activity type
    intensity = a.tipo === 'trail' ? 0.72 : a.tipo === 'ciclismo' ? 0.6 : 0.66;
  }
  return Math.round(durHr * intensity * intensity * 100);
}

export interface PmcPoint { date: string; tss: number; ctl: number; atl: number; tsb: number }

const dayKey = (d: Date) => new Date(d).toISOString().slice(0, 10);

/** Performance Management Chart series: daily TSS + CTL (fitness, 42d),
 *  ATL (fatigue, 7d) and TSB (form = yesterday's CTL−ATL). */
export function computePMC(activities: ActivityRow[], days = 90): {
  series: PmcPoint[];
  current: { ctl: number; atl: number; tsb: number };
} {
  if (activities.length === 0) {
    return { series: [], current: { ctl: 0, atl: 0, tsb: 0 } };
  }

  // Daily TSS totals
  const daily = new Map<string, number>();
  let earliest = new Date();
  for (const a of activities) {
    const k = dayKey(a.fecha);
    daily.set(k, (daily.get(k) ?? 0) + computeTSS(a));
    if (a.fecha < earliest) earliest = a.fecha;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Seed from the first activity (accurate CTL build-up), keep last `days`.
  const start = new Date(earliest);
  start.setHours(0, 0, 0, 0);

  let ctl = 0, atl = 0;
  const full: PmcPoint[] = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    const tss = daily.get(k) ?? 0;
    const prevCtl = ctl, prevAtl = atl;
    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
    full.push({
      date: k,
      tss,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((prevCtl - prevAtl) * 10) / 10,
    });
  }

  const series = full.slice(-days);
  const last = full[full.length - 1];
  return { series, current: { ctl: last.ctl, atl: last.atl, tsb: last.tsb } };
}

export async function pmcForRunner(prisma: PrismaClient, runnerId: number, days = 90) {
  const activities = await (prisma as any).activityLog.findMany({
    where: { runnerId },
    select: {
      fecha: true, duracionMin: true, tiempoElapsadoMin: true,
      fcPromedio: true, fcMax: true, distanciaKm: true, ritmoMinKm: true, tipo: true,
    },
    orderBy: { fecha: 'asc' },
  });
  return computePMC(activities as ActivityRow[], days);
}

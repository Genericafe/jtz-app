import { PrismaClient } from '@prisma/client';
import { computeTSS } from './trainingLoad';

// Training analytics computed live from activity data — weekly volume, split by
// type, HR-intensity distribution, elevation and totals. TrainingPeaks-style.

interface Row {
  fecha: Date;
  distanciaKm: number | null;
  duracionMin: number | null;
  tiempoElapsadoMin: number | null;
  elevacionM: number | null;
  fcPromedio: number | null;
  fcMax: number | null;
  ritmoMinKm: number | null;
  tipo: string;
  caloriasKcal: number | null;
}

const DAY = 86_400_000;

function mondayKey(d: Date): string {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

function hrZone(avg: number, max: number): number {
  const p = avg / (max || 190);
  if (p < 0.60) return 1;
  if (p < 0.70) return 2;
  if (p < 0.80) return 3;
  if (p < 0.90) return 4;
  return 5;
}
const ZONE_LABEL = ['', 'Z1 Recuperación', 'Z2 Aeróbico', 'Z3 Tempo', 'Z4 Umbral', 'Z5 Máximo'];

export async function computeAnalytics(prisma: PrismaClient, runnerId: number, weeks = 12) {
  const start = new Date(Date.now() - weeks * 7 * DAY);
  start.setHours(0, 0, 0, 0);

  const rows: Row[] = await (prisma as any).activityLog.findMany({
    where: { runnerId, fecha: { gte: start } },
    select: {
      fecha: true, distanciaKm: true, duracionMin: true, tiempoElapsadoMin: true,
      elevacionM: true, fcPromedio: true, fcMax: true, ritmoMinKm: true, tipo: true, caloriasKcal: true,
    },
    orderBy: { fecha: 'asc' },
  });

  // Pre-build empty week buckets so the chart has a continuous axis
  const weekMap = new Map<string, { distanceKm: number; durationMin: number; tss: number; elevationM: number; activities: number }>();
  const firstMonday = new Date(mondayKey(start));
  for (let w = new Date(firstMonday); w <= new Date(); w.setDate(w.getDate() + 7)) {
    weekMap.set(mondayKey(w), { distanceKm: 0, durationMin: 0, tss: 0, elevationM: 0, activities: 0 });
  }

  const byType = new Map<string, { distanceKm: number; durationMin: number; count: number }>();
  const zoneMin = [0, 0, 0, 0, 0, 0]; // index 1..5
  const totals = { distanceKm: 0, durationMin: 0, elevationM: 0, tss: 0, activities: 0, calorias: 0 };

  for (const r of rows) {
    const dur = r.duracionMin ?? r.tiempoElapsadoMin ?? 0;
    const dist = r.distanciaKm ?? 0;
    const elev = r.elevacionM ?? 0;
    const tss = computeTSS(r as any);

    const wk = mondayKey(r.fecha);
    const bucket = weekMap.get(wk);
    if (bucket) {
      bucket.distanceKm += dist; bucket.durationMin += dur; bucket.tss += tss;
      bucket.elevationM += elev; bucket.activities += 1;
    }

    const t = byType.get(r.tipo) ?? { distanceKm: 0, durationMin: 0, count: 0 };
    t.distanceKm += dist; t.durationMin += dur; t.count += 1;
    byType.set(r.tipo, t);

    if (r.fcPromedio) zoneMin[hrZone(r.fcPromedio, r.fcMax ?? 190)] += dur;

    totals.distanceKm += dist; totals.durationMin += dur; totals.elevationM += elev;
    totals.tss += tss; totals.activities += 1; totals.calorias += r.caloriasKcal ?? 0;
  }

  const weekly = [...weekMap.entries()].map(([week, v]) => ({
    week: week.slice(5), // MM-DD
    distanceKm: Math.round(v.distanceKm * 10) / 10,
    durationMin: Math.round(v.durationMin),
    tss: Math.round(v.tss),
    elevationM: Math.round(v.elevationM),
    activities: v.activities,
  }));

  return {
    totals: {
      distanceKm: Math.round(totals.distanceKm * 10) / 10,
      durationMin: Math.round(totals.durationMin),
      elevationM: Math.round(totals.elevationM),
      tss: Math.round(totals.tss),
      activities: totals.activities,
      calorias: Math.round(totals.calorias),
    },
    weekly,
    byType: [...byType.entries()].map(([tipo, v]) => ({
      tipo, distanceKm: Math.round(v.distanceKm * 10) / 10, durationMin: Math.round(v.durationMin), count: v.count,
    })).sort((a, b) => b.durationMin - a.durationMin),
    hrZones: [1, 2, 3, 4, 5].map(z => ({ zone: z, label: ZONE_LABEL[z], minutes: Math.round(zoneMin[z]) })),
  };
}

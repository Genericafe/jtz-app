import { PrismaClient } from '@prisma/client';

// ── Badge definitions ─────────────────────────────────────────────────────────
// The catalogue lives in code (not the DB); RunnerBadge only records which ids a
// runner has earned. `threshold`'s meaning depends on `category`.

export type BadgeCategory =
  | 'km'            // total distance accumulated (km)
  | 'elevacion'     // total elevation gain accumulated (m)
  | 'distancia'     // longest single activity (km)
  | 'racha_dias'    // longest run of consecutive days with an activity
  | 'racha_semanas' // longest run of consecutive weeks with an activity
  | 'ciudades';     // distinct cities run in

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  threshold: number;
  nombre: string;
  descripcion: string;
  icon: string; // emoji
}

export const BADGES: BadgeDef[] = [
  // Km acumulados
  { id: 'km_10',   category: 'km', threshold: 10,   nombre: 'Primeros 10 km', descripcion: '10 km acumulados',    icon: '🥉' },
  { id: 'km_50',   category: 'km', threshold: 50,   nombre: '50 km',          descripcion: '50 km acumulados',    icon: '🏃' },
  { id: 'km_100',  category: 'km', threshold: 100,  nombre: 'Centurión',      descripcion: '100 km acumulados',   icon: '🥈' },
  { id: 'km_500',  category: 'km', threshold: 500,  nombre: '500 km',         descripcion: '500 km acumulados',   icon: '🥇' },
  { id: 'km_1000', category: 'km', threshold: 1000, nombre: 'Milero',         descripcion: '1000 km acumulados',  icon: '🏆' },
  // Desnivel acumulado
  { id: 'elev_500',   category: 'elevacion', threshold: 500,   nombre: 'Subelomas',    descripcion: '500 m de desnivel acumulado',    icon: '⛰️' },
  { id: 'elev_2000',  category: 'elevacion', threshold: 2000,  nombre: 'Montañés',     descripcion: '2 000 m de desnivel acumulado',  icon: '🏔️' },
  { id: 'elev_5000',  category: 'elevacion', threshold: 5000,  nombre: 'Escalador',    descripcion: '5 000 m de desnivel acumulado',  icon: '🧗' },
  { id: 'elev_10000', category: 'elevacion', threshold: 10000, nombre: 'Cima',         descripcion: '10 000 m de desnivel acumulado', icon: '🗻' },
  // Récord de una sola carrera
  { id: 'single_5k',  category: 'distancia', threshold: 5,  nombre: '5K',            descripcion: '5 km en una sola actividad',  icon: '5️⃣' },
  { id: 'single_10k', category: 'distancia', threshold: 10, nombre: '10K',           descripcion: '10 km en una sola actividad', icon: '🔟' },
  { id: 'single_21k', category: 'distancia', threshold: 21, nombre: 'Medio maratón', descripcion: '21 km en una sola actividad', icon: '🎽' },
  { id: 'single_42k', category: 'distancia', threshold: 42, nombre: 'Maratón',       descripcion: '42 km en una sola actividad', icon: '🏅' },
  // Rachas de constancia
  { id: 'racha_7dias', category: 'racha_dias',    threshold: 7,  nombre: 'Semana perfecta', descripcion: '7 días seguidos entrenando',    icon: '🔥' },
  { id: 'racha_4sem',  category: 'racha_semanas', threshold: 4,  nombre: 'Constante',       descripcion: '4 semanas seguidas entrenando', icon: '📅' },
  { id: 'racha_12sem', category: 'racha_semanas', threshold: 12, nombre: 'Imparable',       descripcion: '12 semanas seguidas entrenando',icon: '💪' },
  // Ciudades distintas
  { id: 'ciudad_1',  category: 'ciudades', threshold: 1,  nombre: 'Explorador',    descripcion: 'Corriste en tu primera ciudad',    icon: '📍' },
  { id: 'ciudad_3',  category: 'ciudades', threshold: 3,  nombre: 'Viajero',       descripcion: 'Corriste en 3 ciudades distintas', icon: '🗺️' },
  { id: 'ciudad_5',  category: 'ciudades', threshold: 5,  nombre: 'Trotamundos',   descripcion: 'Corriste en 5 ciudades distintas', icon: '✈️' },
  { id: 'ciudad_10', category: 'ciudades', threshold: 10, nombre: 'Sin fronteras', descripcion: 'Corriste en 10 ciudades distintas',icon: '🌎' },
];

// ── Stats + evaluation ────────────────────────────────────────────────────────

export interface BadgeStats {
  totalKm: number;
  totalElev: number;
  longestRunKm: number;
  cities: number;
  maxDayStreak: number;
  maxWeekStreak: number;
}

interface LogRow { distanciaKm: number | null; elevacionM: number | null; fecha: Date; ciudad: string | null }

const dayIndex  = (d: Date) => Math.floor(d.getTime() / 86_400_000);         // days since epoch (UTC)
const weekIndex = (d: Date) => Math.floor((dayIndex(d) + 3) / 7);            // +3 aligns weeks to Monday

/** Longest run of consecutive integers present in the list. */
function maxConsecutive(nums: number[]): number {
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  let best = 0, cur = 0, prev: number | null = null;
  for (const n of uniq) {
    cur = prev !== null && n === prev + 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = n;
  }
  return best;
}

export function computeStats(logs: LogRow[]): BadgeStats {
  let totalKm = 0, totalElev = 0, longestRunKm = 0;
  const cities = new Set<string>();
  const days: number[] = [], weeks: number[] = [];

  for (const l of logs) {
    const km = l.distanciaKm ?? 0;
    totalKm += km;
    totalElev += l.elevacionM ?? 0;
    if (km > longestRunKm) longestRunKm = km;
    if (l.ciudad) cities.add(l.ciudad.trim().toLowerCase());
    days.push(dayIndex(l.fecha));
    weeks.push(weekIndex(l.fecha));
  }

  return {
    totalKm,
    totalElev,
    longestRunKm,
    cities: cities.size,
    maxDayStreak: maxConsecutive(days),
    maxWeekStreak: maxConsecutive(weeks),
  };
}

export function earnedBadgeIds(s: BadgeStats): string[] {
  return BADGES.filter(b => {
    switch (b.category) {
      case 'km':            return s.totalKm      >= b.threshold;
      case 'elevacion':     return s.totalElev    >= b.threshold;
      case 'distancia':     return s.longestRunKm >= b.threshold;
      case 'racha_dias':    return s.maxDayStreak  >= b.threshold;
      case 'racha_semanas': return s.maxWeekStreak >= b.threshold;
      case 'ciudades':      return s.cities        >= b.threshold;
    }
  }).map(b => b.id);
}

// ── Awarding ──────────────────────────────────────────────────────────────────

/** Recompute a runner's stats and persist any newly-earned badges.
 *  Returns the badge definitions that were awarded this time (for notifying). */
export async function awardBadges(runnerId: number, prisma: PrismaClient): Promise<BadgeDef[]> {
  const logs: LogRow[] = await (prisma as any).activityLog.findMany({
    where: { runnerId },
    select: { distanciaKm: true, elevacionM: true, fecha: true, ciudad: true },
  });

  const earned = earnedBadgeIds(computeStats(logs));
  if (earned.length === 0) return [];

  const existing = await (prisma as any).runnerBadge.findMany({
    where: { runnerId, badgeId: { in: earned } },
    select: { badgeId: true },
  });
  const have = new Set(existing.map((e: { badgeId: string }) => e.badgeId));
  const toAward = earned.filter(id => !have.has(id));
  if (toAward.length === 0) return [];

  await (prisma as any).runnerBadge.createMany({
    data: toAward.map(badgeId => ({ runnerId, badgeId })),
    skipDuplicates: true,
  });
  return BADGES.filter(b => toAward.includes(b.id));
}

/** Full badge state for the UI: which are earned (with date) + current progress. */
export async function getBadgeState(runnerId: number, prisma: PrismaClient) {
  const [logs, earnedRows] = await Promise.all([
    (prisma as any).activityLog.findMany({
      where: { runnerId },
      select: { distanciaKm: true, elevacionM: true, fecha: true, ciudad: true },
    }),
    (prisma as any).runnerBadge.findMany({ where: { runnerId }, select: { badgeId: true, earnedAt: true } }),
  ]);
  const stats = computeStats(logs);
  const earnedAt = new Map<string, Date>(earnedRows.map((r: any) => [r.badgeId, r.earnedAt]));

  const badges = BADGES.map(b => ({
    ...b,
    earned: earnedAt.has(b.id),
    earnedAt: earnedAt.get(b.id) ?? null,
  }));
  return { stats, badges };
}

import { PrismaClient } from '@prisma/client';

export type Metric = 'km' | 'elevacion' | 'actividades';

export const METRIC_LABEL: Record<Metric, { label: string; unit: string }> = {
  km:          { label: 'Distancia',  unit: 'km' },
  elevacion:   { label: 'Desnivel',   unit: 'm' },
  actividades: { label: 'Actividades', unit: '' },
};

export interface LeaderRow {
  runnerId: number;
  nombre: string;
  value: number;
}

interface Runner { id: number; nombre: string; apellido: string }

/** Runners included in a scope: all active runners (club) or a group's members. */
export async function runnersInScope(
  prisma: PrismaClient,
  scope: string,
  groupId: number | null | undefined,
): Promise<Runner[]> {
  if (scope === 'group' && groupId) {
    const members = await (prisma as any).runnerGroupMember.findMany({
      where: { groupId },
      select: { runner: { select: { id: true, nombre: true, apellido: true } } },
    });
    return members.map((m: any) => m.runner);
  }
  return (prisma as any).runner.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, apellido: true },
  });
}

/** Ranked leaderboard for a scope + metric within a date range. */
export async function leaderboard(
  prisma: PrismaClient,
  opts: { scope: string; groupId?: number | null; metric: Metric; start: Date; end: Date },
): Promise<LeaderRow[]> {
  const runners = await runnersInScope(prisma, opts.scope, opts.groupId);
  if (runners.length === 0) return [];
  const ids = runners.map(r => r.id);

  const logs = await (prisma as any).activityLog.findMany({
    where: { runnerId: { in: ids }, fecha: { gte: opts.start, lte: opts.end } },
    select: { runnerId: true, distanciaKm: true, elevacionM: true },
  });

  const agg = new Map<number, number>();
  for (const l of logs as { runnerId: number; distanciaKm: number | null; elevacionM: number | null }[]) {
    const v = opts.metric === 'km' ? (l.distanciaKm ?? 0)
            : opts.metric === 'elevacion' ? (l.elevacionM ?? 0)
            : 1;
    agg.set(l.runnerId, (agg.get(l.runnerId) ?? 0) + v);
  }

  return runners
    .map(r => ({
      runnerId: r.id,
      nombre: `${r.nombre} ${r.apellido}`.trim(),
      value: Math.round((agg.get(r.id) ?? 0) * 10) / 10,
    }))
    .sort((a, b) => b.value - a.value);
}

/** First and last millisecond of a given month (defaults to the current one). */
export function monthRange(d = new Date()): { start: Date; end: Date } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

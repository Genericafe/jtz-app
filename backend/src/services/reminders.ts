import { PrismaClient } from '@prisma/client';

// Coach reminders are computed live from current data (payments, plan
// assignments, activity recency) — no storage. They disappear on their own when
// the coach resolves them (pays, renews, the runner logs an activity).

export type ReminderType = 'pago' | 'plan' | 'seguimiento';
export type Severity = 'alta' | 'media' | 'baja';

export interface Reminder {
  id: string;
  type: ReminderType;
  severity: Severity;
  runnerId: number;
  runnerNombre: string;
  titulo: string;
  detalle: string;
  fecha: string | null;
  link: string;
}

// Thresholds (days) — tweak here.
const PAGO_POR_VENCER_DIAS = 5;
const PLAN_POR_RENOVAR_DIAS = 7;
const SEGUIMIENTO_DIAS = 7;

const DAY = 86_400_000;
const fmt = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);

export async function computeCoachReminders(prisma: PrismaClient): Promise<Reminder[]> {
  const now = new Date();
  const inPago = new Date(now.getTime() + PAGO_POR_VENCER_DIAS * DAY);
  const inPlan = new Date(now.getTime() + PLAN_POR_RENOVAR_DIAS * DAY);
  const segCutoff = new Date(now.getTime() - SEGUIMIENTO_DIAS * DAY);

  const runners = await prisma.runner.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, apellido: true },
  });
  const nameOf = new Map(runners.map(r => [r.id, `${r.nombre} ${r.apellido}`.trim()]));
  const activeIds = runners.map(r => r.id);
  if (activeIds.length === 0) return [];

  const reminders: Reminder[] = [];

  // ── Pagos: vencidos y por vencer ────────────────────────────────────────────
  const pagos = await (prisma as any).payment.findMany({
    where: { runnerId: { in: activeIds }, estado: { in: ['pendiente', 'vencido'] } },
    select: { id: true, runnerId: true, concepto: true, monto: true, moneda: true, estado: true, fechaVencimiento: true },
  });
  for (const p of pagos as any[]) {
    const venc: Date | null = p.fechaVencimiento ?? null;
    const overdue = p.estado === 'vencido' || (venc && venc < now);
    const soon = !overdue && venc && venc <= inPago;
    const nombre = nameOf.get(p.runnerId) ?? 'Corredor';
    const monto = `${p.monto} ${p.moneda}`;
    const pagoLink = `/corredores/${p.runnerId}?tab=Pagos`;
    if (overdue) {
      reminders.push({
        id: `pago-${p.id}`, type: 'pago', severity: 'alta', runnerId: p.runnerId, runnerNombre: nombre,
        titulo: `Pago vencido · ${nombre}`,
        detalle: `${p.concepto} — ${monto}${venc ? ` · venció ${fmt(venc)}` : ''}`,
        fecha: venc ? venc.toISOString() : null, link: pagoLink,
      });
    } else if (soon) {
      reminders.push({
        id: `pago-${p.id}`, type: 'pago', severity: 'media', runnerId: p.runnerId, runnerNombre: nombre,
        titulo: `Pago por vencer · ${nombre}`,
        detalle: `${p.concepto} — ${monto} · vence ${fmt(venc!)}`,
        fecha: venc!.toISOString(), link: pagoLink,
      });
    }
  }

  // ── Planes: vencidos y por renovar ──────────────────────────────────────────
  const asigns = await (prisma as any).trainingPlanAssignment.findMany({
    where: { activo: true, runnerId: { in: activeIds }, fechaFin: { not: null, lte: inPlan } },
    select: { id: true, runnerId: true, fechaFin: true, plan: { select: { nombre: true } } },
  });
  for (const a of asigns as any[]) {
    const fin: Date = a.fechaFin;
    const expired = fin < now;
    const nombre = nameOf.get(a.runnerId) ?? 'Corredor';
    reminders.push({
      id: `plan-${a.id}`, type: 'plan', severity: expired ? 'alta' : 'media', runnerId: a.runnerId, runnerNombre: nombre,
      titulo: expired ? `Plan vencido · ${nombre}` : `Plan por renovar · ${nombre}`,
      detalle: `${a.plan?.nombre ?? 'Plan'} — ${expired ? 'terminó' : 'termina'} ${fmt(fin)}`,
      fecha: fin.toISOString(), link: `/corredores/${a.runnerId}?tab=Plan`,
    });
  }

  // ── Seguimiento: corredores sin actividad reciente ──────────────────────────
  const grouped = await (prisma as any).activityLog.groupBy({
    by: ['runnerId'],
    where: { runnerId: { in: activeIds } },
    _max: { fecha: true },
  });
  const lastByRunner = new Map<number, Date | null>(
    (grouped as any[]).map(g => [g.runnerId, g._max?.fecha ?? null]),
  );
  for (const id of activeIds) {
    const last = lastByRunner.get(id) ?? null;
    if (last && last >= segCutoff) continue; // has recent activity
    const nombre = nameOf.get(id) ?? 'Corredor';
    const dias = last ? daysBetween(now, last) : null;
    reminders.push({
      id: `seg-${id}`, type: 'seguimiento',
      severity: !last || (dias ?? 0) >= 14 ? 'media' : 'baja',
      runnerId: id, runnerNombre: nombre,
      titulo: `Seguimiento · ${nombre}`,
      detalle: last ? `Sin actividad hace ${dias} días` : 'Nunca ha registrado actividad',
      fecha: last ? last.toISOString() : null, link: `/corredores/${id}`,
    });
  }

  const rank: Record<Severity, number> = { alta: 0, media: 1, baja: 2 };
  reminders.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return reminders;
}

/** Short summary counts for a digest push. */
export function summarize(reminders: Reminder[]) {
  const pago = reminders.filter(r => r.type === 'pago').length;
  const plan = reminders.filter(r => r.type === 'plan').length;
  const seguimiento = reminders.filter(r => r.type === 'seguimiento').length;
  return { total: reminders.length, pago, plan, seguimiento };
}

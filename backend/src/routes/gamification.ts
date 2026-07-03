import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getBadgeState, BADGES } from '../services/badges';
import { leaderboard, monthRange, METRIC_LABEL, Metric } from '../services/challenges';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

async function isCoach(userId: number): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'coach';
}

async function myGroupIds(userId: number): Promise<number[]> {
  const runner = await prisma.runner.findUnique({ where: { userId }, select: { id: true } });
  if (!runner) return [];
  const rows = await (prisma as any).runnerGroupMember.findMany({
    where: { runnerId: runner.id }, select: { groupId: true },
  });
  return rows.map((r: { groupId: number }) => r.groupId);
}

// GET /gamification/badges — own badges + progress
router.get('/badges', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) {
    return res.json({ stats: null, badges: BADGES.map(b => ({ ...b, earned: false, earnedAt: null })) });
  }
  const state = await getBadgeState(runner.id, prisma);
  return res.json(state);
});

// GET /gamification/badges/:runnerId — coach views a runner's badges
router.get('/badges/:runnerId', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador' });
  const runnerId = Number(req.params.runnerId);
  if (isNaN(runnerId)) return res.status(400).json({ error: 'runnerId inválido' });
  const state = await getBadgeState(runnerId, prisma);
  return res.json(state);
});

// ── Monthly ranking (automatic) ───────────────────────────────────────────────
// GET /gamification/ranking?scope=club|group&groupId=&metric=km
router.get('/ranking', async (req: AuthRequest, res: Response) => {
  const scope   = (req.query.scope as string) === 'group' ? 'group' : 'club';
  const groupId = req.query.groupId ? Number(req.query.groupId) : null;
  const metric  = (['km', 'elevacion', 'actividades'].includes(req.query.metric as string)
    ? req.query.metric : 'km') as Metric;

  const { start, end } = monthRange();
  const rows = await leaderboard(prisma, { scope, groupId, metric, start, end });

  // Highlight where the requesting runner sits
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! }, select: { id: true } });

  return res.json({
    scope, groupId, metric,
    metricInfo: METRIC_LABEL[metric],
    period: { start, end },
    myRunnerId: runner?.id ?? null,
    leaderboard: rows,
  });
});

// ── Coach-created challenges ──────────────────────────────────────────────────

// GET /gamification/challenges — challenges visible to the user, with leaderboard
router.get('/challenges', async (req: AuthRequest, res: Response) => {
  const coach = await isCoach(req.userId!);
  let where: any = {};
  if (!coach) {
    const groupIds = await myGroupIds(req.userId!);
    where = { OR: [{ scope: 'club' }, { scope: 'group', groupId: { in: groupIds } }] };
  }
  // Only show challenges that haven't ended more than 30 days ago
  where.fechaFin = { gte: new Date(Date.now() - 30 * 86_400_000) };

  const challenges = await (prisma as any).challenge.findMany({
    where, orderBy: { fechaFin: 'asc' },
    include: { group: { select: { nombre: true, color: true } } },
  });

  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! }, select: { id: true } });

  const withBoards = await Promise.all(challenges.map(async (c: any) => {
    const rows = await leaderboard(prisma, {
      scope: c.scope, groupId: c.groupId, metric: c.metrica as Metric,
      start: c.fechaInicio, end: c.fechaFin,
    });
    const now = Date.now();
    const status = now < new Date(c.fechaInicio).getTime() ? 'upcoming'
                 : now > new Date(c.fechaFin).getTime() ? 'ended' : 'active';
    return {
      ...c,
      metricInfo: METRIC_LABEL[c.metrica as Metric],
      status,
      participants: rows.length,
      leaderboard: rows.slice(0, 10),
      myValue: runner ? (rows.find(r => r.runnerId === runner.id)?.value ?? 0) : null,
    };
  }));

  return res.json(withBoards);
});

// POST /gamification/challenges — coach creates a challenge
router.post('/challenges', async (req: AuthRequest, res: Response) => {
  if (!await isCoach(req.userId!)) return res.status(403).json({ error: 'Solo el entrenador' });

  const schema = z.object({
    nombre:      z.string().min(1),
    descripcion: z.string().optional(),
    metrica:     z.enum(['km', 'elevacion', 'actividades']).default('km'),
    meta:        z.number().positive().optional(),
    fechaInicio: z.string(),
    fechaFin:    z.string(),
    scope:       z.enum(['club', 'group']).default('club'),
    groupId:     z.number().int().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });
  const d = parse.data;
  if (d.scope === 'group' && !d.groupId) return res.status(400).json({ error: 'Selecciona un grupo' });

  const challenge = await (prisma as any).challenge.create({
    data: {
      nombre: d.nombre, descripcion: d.descripcion,
      metrica: d.metrica, meta: d.meta,
      fechaInicio: new Date(d.fechaInicio), fechaFin: new Date(d.fechaFin),
      scope: d.scope, groupId: d.scope === 'group' ? d.groupId : null,
      createdBy: req.userId!,
    },
  });
  return res.status(201).json(challenge);
});

// DELETE /gamification/challenges/:id — coach removes a challenge
router.delete('/challenges/:id', async (req: AuthRequest, res: Response) => {
  if (!await isCoach(req.userId!)) return res.status(403).json({ error: 'Solo el entrenador' });
  await (prisma as any).challenge.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  return res.json({ ok: true });
});

export default router;

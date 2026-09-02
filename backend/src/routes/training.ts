import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { pmcForRunner } from '../services/trainingLoad';
import { computeAnalytics } from '../services/analytics';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

async function isCoach(userId: number) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'coach';
}

// GET /training/pmc?runnerId=&days=90 — fitness/fatigue/form series
router.get('/pmc', async (req: AuthRequest, res: Response) => {
  const days = Math.min(365, Math.max(30, Number(req.query.days) || 90));
  let runnerId = req.query.runnerId ? Number(req.query.runnerId) : null;

  if (runnerId) {
    // Only a coach may look at someone else's PMC
    if (!(await isCoach(req.userId!))) {
      const own = await prisma.runner.findUnique({ where: { userId: req.userId! }, select: { id: true } });
      if (own?.id !== runnerId) return res.status(403).json({ error: 'No autorizado' });
    }
  } else {
    const own = await prisma.runner.findUnique({ where: { userId: req.userId! }, select: { id: true } });
    if (!own) return res.json({ series: [], current: { ctl: 0, atl: 0, tsb: 0 } });
    runnerId = own.id;
  }

  const pmc = await pmcForRunner(prisma, runnerId!, days);
  return res.json(pmc);
});

// GET /training/analytics?runnerId=&weeks=12 — volume, splits, zones, totals
router.get('/analytics', async (req: AuthRequest, res: Response) => {
  const weeks = Math.min(52, Math.max(4, Number(req.query.weeks) || 12));
  let runnerId = req.query.runnerId ? Number(req.query.runnerId) : null;

  if (runnerId) {
    if (!(await isCoach(req.userId!))) {
      const own = await prisma.runner.findUnique({ where: { userId: req.userId! }, select: { id: true } });
      if (own?.id !== runnerId) return res.status(403).json({ error: 'No autorizado' });
    }
  } else {
    const own = await prisma.runner.findUnique({ where: { userId: req.userId! }, select: { id: true } });
    if (!own) return res.json({ totals: null, weekly: [], byType: [], hrZones: [] });
    runnerId = own.id;
  }

  const data = await computeAnalytics(prisma, runnerId!, weeks);
  return res.json(data);
});

// GET /training/overview — coach: current fitness/fatigue/form of every runner
router.get('/overview', async (req: AuthRequest, res: Response) => {
  if (!(await isCoach(req.userId!))) return res.status(403).json({ error: 'Solo el entrenador' });

  const runners = await prisma.runner.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, apellido: true },
  });

  const rows = await Promise.all(runners.map(async r => {
    const { current } = await pmcForRunner(prisma, r.id, 42);
    return {
      runnerId: r.id,
      nombre: `${r.nombre} ${r.apellido}`.trim(),
      ...current,
    };
  }));

  // Most fatigued / least form first (coach's attention list)
  rows.sort((a, b) => a.tsb - b.tsb);
  return res.json(rows);
});

export default router;

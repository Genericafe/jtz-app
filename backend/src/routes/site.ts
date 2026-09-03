import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /site — current landing photos (coach)
router.get('/', async (_req: AuthRequest, res: Response) => {
  const cfg = await (prisma as any).siteConfig.findUnique({ where: { id: 1 } });
  return res.json(cfg ?? {});
});

// PUT /site — update landing photos (coach only)
router.put('/', async (req: AuthRequest, res: Response) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
  if (u?.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador' });

  const data: any = {};
  for (const k of ['heroImagen', 'comunidadImagen', 'accionImagen']) {
    if (req.body?.[k] !== undefined) data[k] = req.body[k] || null;
  }
  const cfg = await (prisma as any).siteConfig.upsert({
    where: { id: 1 }, update: data, create: { id: 1, ...data },
  });
  return res.json(cfg);
});

export default router;

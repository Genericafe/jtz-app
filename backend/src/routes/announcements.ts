import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import { sendToAllRunners } from '../services/pushNotifications';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/', async (_req: AuthRequest, res: Response) => {
  const announcements = await prisma.announcement.findMany({
    where: { publicado: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(announcements);
});

router.post('/', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    titulo: z.string(),
    contenido: z.string(),
    tipo: z.enum(['general', 'urgente', 'entrenamiento', 'evento']).default('general'),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const ann = await prisma.announcement.create({ data: parse.data });

  sendToAllRunners(
    parse.data.titulo,
    parse.data.contenido.slice(0, 120),
    { type: 'announcement', id: String(ann.id) },
  ).catch(() => {});

  return res.status(201).json(ann);
});

router.put('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  const ann = await prisma.announcement.update({
    where: { id: Number(req.params.id) },
    data: req.body,
  });
  return res.json(ann);
});

router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  await prisma.announcement.update({ where: { id: Number(req.params.id) }, data: { publicado: false } });
  return res.json({ ok: true });
});

export default router;

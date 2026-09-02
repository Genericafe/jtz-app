import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { computeCoachReminders, summarize } from '../services/reminders';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /reminders — coach's live actionable reminders (inbox)
router.get('/', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
  if (user?.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador' });

  const reminders = await computeCoachReminders(prisma);
  return res.json({ reminders, resumen: summarize(reminders) });
});

export default router;

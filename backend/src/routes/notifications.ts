import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// POST /notifications/token — registrar token FCM al iniciar sesión
router.post('/token', async (req: AuthRequest, res: Response) => {
  const { token, platform } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token requerido' });
  }

  await (prisma as any).pushToken.upsert({
    where: { token },
    update: { userId: req.userId!, platform: platform ?? 'android', updatedAt: new Date() },
    create: { userId: req.userId!, token, platform: platform ?? 'android' },
  });

  return res.json({ ok: true });
});

// DELETE /notifications/token — eliminar al cerrar sesión
router.delete('/token', async (req: AuthRequest, res: Response) => {
  const { token } = req.body;
  if (!token) return res.json({ ok: true });

  await (prisma as any).pushToken.deleteMany({
    where: { token, userId: req.userId! },
  });

  return res.json({ ok: true });
});

export default router;

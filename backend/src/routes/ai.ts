import { Router, Response } from 'express';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Placeholder — text improvement is handled client-side in the frontend.
// This route exists for future server-side NLP integration.
router.post('/improve-text', coachOnly, (_req: AuthRequest, res: Response) => {
  return res.status(501).json({ error: 'Mejora de texto procesada en el cliente.' });
});

export default router;

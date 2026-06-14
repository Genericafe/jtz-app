import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /integrations/activities
router.get('/activities', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
  try {
    const logs = await (prisma as any).activityLog.findMany({
      where: { runnerId: runner.id },
      orderBy: { fecha: 'desc' },
      take: 50,
    });
    return res.json(logs);
  } catch {
    return res.json([]); // table may not exist yet — return empty list
  }
});

// POST /integrations/activities
router.post('/activities', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:       z.string().optional(),
    tipo:         z.string().default('correr'),
    fecha:        z.string().optional(),
    diaId:        z.number().int().optional(),
    distanciaKm:  z.number().optional(),
    duracionMin:  z.number().optional().transform(v => v != null ? Math.round(v) : v),
    fcPromedio:   z.number().int().optional(),
    fcMax:        z.number().int().optional(),
    elevacionM:   z.number().optional(),
    caloriasKcal: z.number().int().optional(),
    potenciaW:    z.number().int().optional(),
    gpxContent:   z.string().optional(),
    gpxNombre:    z.string().optional(),
    notas:        z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });

  const d = parse.data;
  const ritmoMinKm = d.distanciaKm && d.duracionMin
    ? d.duracionMin / d.distanciaKm : undefined;

  try {
    const log = await (prisma as any).activityLog.create({
      data: {
        runnerId: runner.id,
        fuente:   d.gpxContent ? 'gpx' : 'manual',
        ...d,
        ritmoMinKm,
        fecha: d.fecha ? new Date(d.fecha) : new Date(),
      },
    });
    return res.status(201).json(log);
  } catch (err: any) {
    console.error('[activity log create]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Error al guardar la actividad' });
  }
});

// DELETE /integrations/activities/:id
router.delete('/activities/:id', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'No encontrado' });
  try {
    await (prisma as any).activityLog.deleteMany({
      where: { id: Number(req.params.id), runnerId: runner.id },
    });
  } catch { /* ignore if table doesn't exist */ }
  return res.json({ ok: true });
});

export default router;

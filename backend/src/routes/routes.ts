import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

const routeSchema = z.object({
  nombre:      z.string().min(1).max(100),
  descripcion: z.string().optional(),
  tipo:        z.enum(['correr', 'trail', 'ciclismo', 'natacion', 'otro']).default('correr'),
  distanciaKm: z.number().positive().optional(),
  gpxContent:  z.string().optional(),
  gpxNombre:   z.string().optional(),
  isPublic:    z.boolean().default(false),
});

// List: club routes + own + public (deduplicated)
router.get('/', async (req: AuthRequest, res: Response) => {
  const tipo = req.query.tipo as string | undefined;
  const where: Record<string, unknown> = {
    OR: [
      { authorId: req.userId },
      { isPublic: true },
      { isClubRoute: true },
    ],
  };
  if (tipo) where.tipo = tipo;

  const routes = await (prisma as any).route.findMany({
    where,
    include: { author: { select: { id: true, email: true, role: true, runner: { select: { nombre: true, apellido: true } } } } },
    orderBy: [{ isClubRoute: 'desc' }, { createdAt: 'desc' }],
  });
  return res.json(routes);
});

// Get single route (public, club, or own)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const route = await (prisma as any).route.findFirst({
    where: {
      id: Number(req.params.id),
      OR: [{ authorId: req.userId }, { isPublic: true }, { isClubRoute: true }],
    },
    include: { author: { select: { id: true, role: true, runner: { select: { nombre: true, apellido: true } } } } },
  });
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });
  return res.json(route);
});

// Create
router.post('/', async (req: AuthRequest, res: Response) => {
  const parse = routeSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const route = await (prisma as any).route.create({
    data: { ...parse.data, authorId: req.userId },
    include: { author: { select: { id: true, role: true, runner: { select: { nombre: true, apellido: true } } } } },
  });
  return res.status(201).json(route);
});

// Update own route
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await (prisma as any).route.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Ruta no encontrada' });
  if (existing.authorId !== req.userId) return res.status(403).json({ error: 'Sin permiso' });

  const parse = routeSchema.partial().safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const route = await (prisma as any).route.update({
    where: { id: Number(req.params.id) },
    data: parse.data,
  });
  return res.json(route);
});

// Delete own route
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await (prisma as any).route.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Ruta no encontrada' });
  if (existing.authorId !== req.userId && req.userRole !== 'coach') {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  await (prisma as any).route.delete({ where: { id: Number(req.params.id) } });
  return res.json({ ok: true });
});

// Toggle club route (coach only)
router.post('/:id/club', async (req: AuthRequest, res: Response) => {
  if (req.userRole !== 'coach') return res.status(403).json({ error: 'Solo el coach puede marcar rutas oficiales' });
  const existing = await (prisma as any).route.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Ruta no encontrada' });
  const route = await (prisma as any).route.update({
    where: { id: Number(req.params.id) },
    data: { isClubRoute: !existing.isClubRoute, isPublic: !existing.isClubRoute ? true : existing.isPublic },
  });
  return res.json(route);
});

export default router;

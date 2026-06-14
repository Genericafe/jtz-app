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
      select: {
        id: true, diaId: true, fuente: true, nombre: true, tipo: true, fecha: true,
        distanciaKm: true, duracionMin: true, tiempoElapsadoMin: true, ritmoMinKm: true,
        fcPromedio: true, fcMax: true,
        cadenciaPromedio: true, cadenciaMax: true,
        elevacionM: true, elevacionPerdidaM: true,
        caloriasKcal: true,
        potenciaW: true, potenciaMax: true, potenciaPonderada: true, potenciaPromedio30s: true,
        gpxNombre: true, notas: true,
        confirmadoPorCoach: true, confirmedAt: true,
        createdAt: true,
      },
    });
    return res.json(logs);
  } catch {
    return res.json([]);
  }
});

// GET /integrations/activities/day/:diaId — actividades por día de entrenamiento
// Coach: todas; runner: solo la propia
router.get('/activities/day/:diaId', async (req: AuthRequest, res: Response) => {
  const diaId = Number(req.params.diaId);
  if (isNaN(diaId)) return res.status(400).json({ error: 'diaId inválido' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  try {
    if (user.role === 'coach') {
      const logs = await (prisma as any).activityLog.findMany({
        where: { diaId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, diaId: true, fuente: true, nombre: true, tipo: true, fecha: true,
          distanciaKm: true, duracionMin: true, tiempoElapsadoMin: true, ritmoMinKm: true,
          fcPromedio: true, fcMax: true,
          cadenciaPromedio: true, cadenciaMax: true,
          elevacionM: true, elevacionPerdidaM: true,
          caloriasKcal: true,
          potenciaW: true, potenciaMax: true, potenciaPonderada: true, potenciaPromedio30s: true,
          gpxNombre: true, notas: true,
          confirmadoPorCoach: true, confirmedAt: true,
          createdAt: true,
          runner: { select: { id: true, nombre: true, apellido: true } },
        },
      });
      return res.json(logs);
    } else {
      const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
      if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
      const logs = await (prisma as any).activityLog.findMany({
        where: { diaId, runnerId: runner.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true, diaId: true, fuente: true, nombre: true, tipo: true, fecha: true,
          distanciaKm: true, duracionMin: true, tiempoElapsadoMin: true, ritmoMinKm: true,
          fcPromedio: true, fcMax: true,
          cadenciaPromedio: true, cadenciaMax: true,
          elevacionM: true, elevacionPerdidaM: true,
          caloriasKcal: true,
          potenciaW: true, potenciaMax: true, potenciaPonderada: true, potenciaPromedio30s: true,
          gpxNombre: true, notas: true,
          confirmadoPorCoach: true, confirmedAt: true,
          createdAt: true,
        },
      });
      return res.json(logs);
    }
  } catch {
    return res.json([]);
  }
});

// GET /integrations/activities/:id — actividad completa con gpxContent
router.get('/activities/:id', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  try {
    let log;
    if (user.role === 'coach') {
      log = await (prisma as any).activityLog.findUnique({ where: { id } });
    } else {
      const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
      if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
      log = await (prisma as any).activityLog.findFirst({ where: { id, runnerId: runner.id } });
    }
    if (!log) return res.status(404).json({ error: 'Actividad no encontrada' });
    return res.json(log);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error' });
  }
});

// POST /integrations/activities
router.post('/activities', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:              z.string().optional(),
    tipo:                z.string().default('correr'),
    fecha:               z.string().optional(),
    diaId:               z.number().int().optional(),
    distanciaKm:         z.number().optional(),
    duracionMin:         z.number().optional().transform(v => v != null ? Math.round(v) : v),
    tiempoElapsadoMin:   z.number().optional(),
    fcPromedio:          z.number().int().optional(),
    fcMax:               z.number().int().optional(),
    cadenciaPromedio:    z.number().int().optional(),
    cadenciaMax:         z.number().int().optional(),
    elevacionM:          z.number().optional(),
    elevacionPerdidaM:   z.number().optional(),
    caloriasKcal:        z.number().int().optional(),
    potenciaW:           z.number().int().optional(),
    potenciaMax:         z.number().int().optional(),
    potenciaPonderada:   z.number().int().optional(),
    potenciaPromedio30s: z.number().int().optional(),
    gpxContent:          z.string().optional(),
    gpxNombre:           z.string().optional(),
    notas:               z.string().optional(),
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

// PATCH /integrations/activities/:id/confirm — el coach confirma una actividad
router.patch('/activities/:id/confirm', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador puede confirmar actividades' });

  try {
    const log = await (prisma as any).activityLog.update({
      where: { id: Number(req.params.id) },
      data: { confirmadoPorCoach: true, confirmedAt: new Date() },
    });
    return res.json(log);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error al confirmar' });
  }
});

// PATCH /integrations/activities/:id/unconfirm — el coach quita la confirmación
router.patch('/activities/:id/unconfirm', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador puede modificar confirmaciones' });

  try {
    const log = await (prisma as any).activityLog.update({
      where: { id: Number(req.params.id) },
      data: { confirmadoPorCoach: false, confirmedAt: null },
    });
    return res.json(log);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error al quitar confirmación' });
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

import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import { generatePlan, PlanConfig } from '../services/planGenerator';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });

  if (user?.role === 'coach') {
    const plans = await prisma.trainingPlan.findMany({
      include: { _count: { select: { asignaciones: true, semanas: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(plans);
  }

  // Runner: solo ve los planes que le fueron asignados
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.json([]);

  const assignments = await prisma.trainingPlanAssignment.findMany({
    where: { runnerId: runner.id, activo: true },
    include: {
      plan: {
        include: { _count: { select: { semanas: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(assignments.map(a => a.plan));
});

// ── Coach preferences — must be BEFORE /:id to avoid route shadowing ──────────
router.get('/preferences', coachOnly, async (req: AuthRequest, res: Response) => {
  try {
    const pref = await (prisma as any).coachPreference.findUnique({ where: { userId: req.userId! } });
    return res.json(pref ? JSON.parse(pref.data) : {});
  } catch { return res.json({}); }
});

router.put('/preferences', coachOnly, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await (prisma as any).coachPreference.findUnique({ where: { userId: req.userId! } });
    const merged = { ...(existing ? JSON.parse(existing.data) : {}), ...req.body };
    await (prisma as any).coachPreference.upsert({
      where:  { userId: req.userId! },
      update: { data: JSON.stringify(merged) },
      create: { userId: req.userId!, data: JSON.stringify(merged) },
    });
    return res.json(merged);
  } catch { return res.json(req.body); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });

  if (user?.role !== 'coach') {
    // Runner: verificar que esté asignado a este plan
    const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
    if (!runner) return res.status(403).json({ error: 'Acceso no autorizado' });

    const assignment = await prisma.trainingPlanAssignment.findFirst({
      where: { runnerId: runner.id, planId: Number(req.params.id), activo: true },
    });
    if (!assignment) return res.status(403).json({ error: 'No tienes acceso a este plan' });

    // Devolver el plan sin info de otros corredores
    const plan = await prisma.trainingPlan.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        semanas: { include: { dias: true }, orderBy: { numeroSemana: 'asc' } },
      },
    });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    return res.json(plan);
  }

  // Coach: plan completo con todos los corredores asignados
  const plan = await prisma.trainingPlan.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      semanas: { include: { dias: true }, orderBy: { numeroSemana: 'asc' } },
      asignaciones: {
        where: { activo: true },
        include: { runner: { select: { id: true, nombre: true, apellido: true, nivel: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  return res.json(plan);
});

const modalidadesSchema = z.object({
  ciclismo:  z.boolean().optional(),
  natacion:  z.boolean().optional(),
  fuerza:    z.boolean().optional(),
  funcional: z.boolean().optional(),
}).optional();

// ── Generate plan preview (does not save) ─────────────────────────────────────
router.post('/preview', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nivel:             z.enum(['principiante', 'intermedio', 'avanzado', 'elite']),
    objetivo:          z.string(),
    duracionSemanas:   z.number().int().min(4).max(28),
    sesionesSemanales: z.number().int().min(3).max(7),
    kmBaseActual:      z.number().optional(),
    modalidades:       modalidadesSchema,
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  try {
    const plan = generatePlan(parse.data as PlanConfig);
    return res.json(plan);
  } catch (err) {
    console.error('[preview] generatePlan error:', err);
    return res.status(500).json({ error: 'Error generando el plan. Verifica los parámetros.' });
  }
});

// ── Generate and save plan to DB ──────────────────────────────────────────────
router.post('/generate', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nivel:             z.enum(['principiante', 'intermedio', 'avanzado', 'elite']),
    objetivo:          z.string(),
    duracionSemanas:   z.number().int().min(4).max(28),
    sesionesSemanales: z.number().int().min(3).max(7),
    kmBaseActual:      z.number().optional(),
    modalidades:       modalidadesSchema,
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const generated = generatePlan(parse.data as PlanConfig);

  const plan = await prisma.trainingPlan.create({
    data: {
      nombre:          generated.nombre,
      descripcion:     `${generated.descripcion}\n\n📚 Filosofía: ${generated.filosofia}\n\n✅ Principios:\n${generated.principios.map(p => `• ${p}`).join('\n')}`,
      duracionSemanas: generated.duracionSemanas,
      nivel:           generated.nivel,
      objetivo:        generated.objetivo,
      semanas: {
        create: generated.semanas.map(s => ({
          numeroSemana: s.numeroSemana,
          descripcion:  `${s.fase} · ${s.descripcion}`,
          dias: {
            create: s.dias.map(d => ({
              diaSemana:   d.diaSemana,
              tipo:        d.tipo,
              distanciaKm: d.distanciaKm ?? null,
              duracionMin: d.duracionMin ?? null,
              intensidad:  d.intensidad,
              descripcion: `${d.zona ? `[${d.zona}] ` : ''}${d.descripcion}`,
            })),
          },
        })),
      },
    },
    include: { semanas: { include: { dias: true }, orderBy: { numeroSemana: 'asc' } } },
  });

  return res.status(201).json(plan);
});

router.post('/', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:          z.string(),
    descripcion:     z.string().optional(),
    duracionSemanas: z.number().int().min(1).default(4),
    nivel:           z.string().optional(),
    objetivo:        z.string().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const plan = await prisma.trainingPlan.create({ data: parse.data });
  return res.status(201).json(plan);
});

router.put('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  const plan = await prisma.trainingPlan.update({
    where: { id: Number(req.params.id) },
    data: req.body,
  });
  return res.json(plan);
});

// ── Update a single training day ──────────────────────────────────────────────
router.put('/day/:dayId', coachOnly, async (req: AuthRequest, res: Response) => {
  const day = await prisma.trainingDay.update({
    where: { id: Number(req.params.dayId) },
    data: req.body,
  });
  return res.json(day);
});

router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  await prisma.trainingPlan.delete({ where: { id: Number(req.params.id) } });
  return res.json({ ok: true });
});

// ── Toggle plan as template ───────────────────────────────────────────────────
router.post('/:id/template', coachOnly, async (req: AuthRequest, res: Response) => {
  const plan = await prisma.trainingPlan.findUnique({ where: { id: Number(req.params.id) } }) as ({ isTemplate: boolean } & Record<string, unknown>) | null;
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  const updated = await prisma.trainingPlan.update({
    where: { id: Number(req.params.id) },
    data: { isTemplate: !plan.isTemplate } as any,
  });
  return res.json(updated);
});


router.post('/:id/assign', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    runnerId:   z.number().int(),
    fechaInicio: z.string(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const plan = await prisma.trainingPlan.findUnique({ where: { id: Number(req.params.id) } });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

  const fechaInicio = new Date(parse.data.fechaInicio);
  const fechaFin    = new Date(fechaInicio);
  fechaFin.setDate(fechaFin.getDate() + plan.duracionSemanas * 7);

  await prisma.trainingPlanAssignment.updateMany({
    where: { runnerId: parse.data.runnerId, activo: true },
    data: { activo: false },
  });

  const assignment = await prisma.trainingPlanAssignment.create({
    data: { runnerId: parse.data.runnerId, planId: plan.id, fechaInicio, fechaFin },
  });
  return res.status(201).json(assignment);
});

export default router;

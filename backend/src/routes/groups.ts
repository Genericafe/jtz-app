import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// ── List groups (coach: all with members; runner: groups they belong to) ──────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole === 'coach') {
      const groups = await prisma.runnerGroup.findMany({
        orderBy: { nombre: 'asc' },
        include: {
          members: {
            include: {
              runner: { select: { id: true, nombre: true, apellido: true, fotoPerfil: true, nivel: true, activo: true } },
            },
          },
          _count: { select: { members: true } },
        },
      });
      return res.json(groups);
    }

    // Runner: only groups they belong to (names only)
    const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
    if (!runner) return res.json([]);
    const groups = await prisma.runnerGroup.findMany({
      where: { members: { some: { runnerId: runner.id } } },
      select: { id: true, nombre: true, color: true },
      orderBy: { nombre: 'asc' },
    });
    return res.json(groups);
  } catch (err) {
    console.error('GET /groups error:', err);
    return res.status(500).json({ error: 'Error al obtener grupos' });
  }
});

// ── Create group ──────────────────────────────────────────────────────────────
router.post('/', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:      z.string().min(1, 'El nombre es obligatorio'),
    descripcion: z.string().optional(),
    color:       z.string().optional(),
    runnerIds:   z.array(z.number().int()).optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0]?.message ?? 'Datos inválidos' });

  const { nombre, descripcion, color, runnerIds } = parse.data;
  try {
    const group = await prisma.runnerGroup.create({
      data: {
        nombre,
        descripcion: descripcion || null,
        color: color || '#22c55e',
        members: runnerIds?.length
          ? { create: runnerIds.map(runnerId => ({ runnerId })) }
          : undefined,
      },
      include: { _count: { select: { members: true } } },
    });
    return res.status(201).json(group);
  } catch (err) {
    console.error('POST /groups error:', err);
    return res.status(500).json({ error: 'Error al crear el grupo' });
  }
});

// ── Update group (name, color, description) ───────────────────────────────────
router.put('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:      z.string().min(1).optional(),
    descripcion: z.string().nullable().optional(),
    color:       z.string().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });
  try {
    const group = await prisma.runnerGroup.update({
      where: { id: Number(req.params.id) },
      data: parse.data,
    });
    return res.json(group);
  } catch {
    return res.status(404).json({ error: 'Grupo no encontrado' });
  }
});

// ── Delete group ──────────────────────────────────────────────────────────────
router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.runnerGroup.delete({ where: { id: Number(req.params.id) } });
    return res.json({ ok: true });
  } catch {
    return res.status(404).json({ error: 'Grupo no encontrado' });
  }
});

// ── Replace the full member list of a group ───────────────────────────────────
router.put('/:id/members', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({ runnerIds: z.array(z.number().int()) });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const groupId = Number(req.params.id);
  try {
    const group = await prisma.runnerGroup.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Reconcile: delete removed, add new
    await prisma.runnerGroupMember.deleteMany({
      where: { groupId, runnerId: { notIn: parse.data.runnerIds } },
    });
    for (const runnerId of parse.data.runnerIds) {
      await prisma.runnerGroupMember.upsert({
        where:  { groupId_runnerId: { groupId, runnerId } },
        update: {},
        create: { groupId, runnerId },
      });
    }
    const updated = await prisma.runnerGroup.findUnique({
      where: { id: groupId },
      include: { members: { include: { runner: { select: { id: true, nombre: true, apellido: true } } } } },
    });
    return res.json(updated);
  } catch (err) {
    console.error('PUT /groups/:id/members error:', err);
    return res.status(500).json({ error: 'Error al actualizar miembros' });
  }
});

// ── Assign a training plan to every current member of a group ──────────────────
router.post('/:id/assign-plan', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({ planId: z.number().int(), fechaInicio: z.string() });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const groupId = Number(req.params.id);
  try {
    const plan = await prisma.trainingPlan.findUnique({ where: { id: parse.data.planId } });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const members = await prisma.runnerGroupMember.findMany({ where: { groupId } });
    if (members.length === 0) return res.status(400).json({ error: 'El grupo no tiene corredores' });

    const fechaInicio = new Date(parse.data.fechaInicio);
    const fechaFin    = new Date(fechaInicio);
    fechaFin.setDate(fechaFin.getDate() + plan.duracionSemanas * 7);

    let assigned = 0;
    for (const m of members) {
      // Deactivate the runner's current active plan, then assign the new one
      await prisma.trainingPlanAssignment.updateMany({
        where: { runnerId: m.runnerId, activo: true },
        data:  { activo: false },
      });
      await prisma.trainingPlanAssignment.create({
        data: { runnerId: m.runnerId, planId: plan.id, groupId, fechaInicio, fechaFin },
      });
      assigned++;
    }
    return res.status(201).json({ ok: true, assigned });
  } catch (err) {
    console.error('POST /groups/:id/assign-plan error:', err);
    return res.status(500).json({ error: 'Error al asignar el plan al grupo' });
  }
});

export default router;

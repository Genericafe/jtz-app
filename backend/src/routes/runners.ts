import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Perfil del runner autenticado
router.get('/me', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({
    where: { userId: req.userId! },
    include: {
      user: { select: { email: true } },
      trainingPlans: {
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      eventRegistrations: {
        include: { event: true },
      },
    },
  });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
  return res.json(runner);
});

// Actualizar propio perfil (runners)
router.put('/me', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre: z.string().optional(),
    apellido: z.string().optional(),
    telefono: z.string().optional(),
    ciudad: z.string().optional(),
    estado: z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const runner = await prisma.runner.update({
    where: { userId: req.userId! },
    data: parse.data,
  });
  return res.json(runner);
});

// Lista todos los corredores (coach)
router.get('/', async (_req: AuthRequest, res: Response) => {
  const runners = await prisma.runner.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { nombre: 'asc' },
  });
  return res.json(runners);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      user: { select: { email: true } },
      memberships: { orderBy: { createdAt: 'desc' }, take: 1 },
      payments: { orderBy: { createdAt: 'desc' }, take: 20 },
      trainingPlans: {
        include: { plan: { include: { semanas: { include: { dias: true }, orderBy: { numeroSemana: 'asc' } } } } },
        orderBy: { createdAt: 'desc' },
      },
      eventRegistrations: {
        include: { event: true },
        orderBy: { createdAt: 'desc' },
      },
      communicationLogs: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!runner) return res.status(404).json({ error: 'Corredor no encontrado' });
  return res.json(runner);
});

// Agregar log de comunicación
router.post('/:id/logs', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    tipo: z.enum(['whatsapp', 'email', 'llamada', 'presencial']),
    direccion: z.enum(['entrante', 'saliente']).default('entrante'),
    mensaje: z.string(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const log = await prisma.communicationLog.create({
    data: { runnerId: Number(req.params.id), ...parse.data },
  });
  return res.status(201).json(log);
});

router.delete('/:id/logs/:logId', coachOnly, async (req: AuthRequest, res: Response) => {
  await prisma.communicationLog.delete({ where: { id: Number(req.params.logId) } });
  return res.json({ ok: true });
});

router.post('/', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6).default('JTZ2024!'),
    nombre: z.string(),
    apellido: z.string(),
    telefono: z.string().optional(),
    ciudad: z.string().optional(),
    nivel: z.enum(['principiante', 'intermedio', 'avanzado', 'elite']).optional(),
    fechaNacimiento: z.string().optional(),
    notas: z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const { email, password, nombre, apellido, telefono, ciudad, nivel, fechaNacimiento, notas } = parse.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'El correo ya está registrado' });

  const bcrypt = await import('bcryptjs');
  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      role: 'runner',
      runner: {
        create: {
          nombre,
          apellido,
          telefono,
          ciudad: ciudad ?? 'México',
          nivel: nivel ?? 'principiante',
          fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : undefined,
          notas,
        },
      },
    },
    include: { runner: true },
  });

  return res.status(201).json(user.runner);
});

router.put('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre: z.string().optional(),
    apellido: z.string().optional(),
    telefono: z.string().optional(),
    ciudad: z.string().optional(),
    nivel: z.enum(['principiante', 'intermedio', 'avanzado', 'elite']).optional(),
    activo: z.boolean().optional(),
    notas: z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const runner = await prisma.runner.update({
    where: { id: Number(req.params.id) },
    data: parse.data,
  });
  return res.json(runner);
});

router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  await prisma.runner.update({ where: { id: Number(req.params.id) }, data: { activo: false } });
  return res.json({ ok: true });
});

export default router;

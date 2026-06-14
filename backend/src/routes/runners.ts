import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import { sendBulkUpdate } from '../services/email';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Perfil del runner autenticado
router.get('/me', async (req: AuthRequest, res: Response) => {
  const [runner, user] = await Promise.all([
    prisma.runner.findUnique({
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
        activityLogs: {
          orderBy: { fecha: 'desc' },
          take: 20,
        },
      },
    }),
    prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } }),
  ]);
  if (!runner) {
    if (req.userRole === 'coach') {
      // Coach with no runner record yet — return synthetic profile
      return res.json({
        id: 0, userId: req.userId, nombre: '', apellido: '',
        ciudad: 'México', estado: 'México', pais: 'México',
        nivel: 'elite', telefono: null, genero: null,
        tallaCamiseta: null, notas: null, activo: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        trainingPlans: [], payments: [], eventRegistrations: [], activityLogs: [],
        paidLeadEventIds: [],
      });
    }
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  // Include paid/confirmed EventLeads (for runners who registered via landing page)
  const paidLeads = user ? await prisma.eventLead.findMany({
    where: { email: user.email, estado: { in: ['pagado', 'confirmado'] } },
    select: { eventId: true },
  }) : [];
  const paidLeadEventIds = paidLeads.map(l => l.eventId);

  return res.json({ ...runner, paidLeadEventIds });
});

// Actualizar propio perfil (runners y coach)
router.put('/me', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:        z.string().optional(),
    apellido:      z.string().optional(),
    telefono:      z.string().optional(),
    ciudad:        z.string().optional(),
    estado:        z.string().optional(),
    pais:          z.string().optional(),
    genero:        z.string().optional(),
    tallaCamiseta: z.string().optional(),
    notas:         z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  try {
    // Upsert: crea el perfil si no existe (útil para coaches que no tienen runner)
    const existing = await prisma.runner.findUnique({ where: { userId: req.userId! } });
    let runner;
    if (existing) {
      runner = await prisma.runner.update({
        where: { userId: req.userId! },
        data: parse.data,
      });
    } else {
      // Verify user exists before create — prevents FK violation if JWT is stale
      const userExists = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true } });
      if (!userExists) {
        return res.status(401).json({ error: 'Sesión inválida. Cierra sesión y vuelve a iniciar.' });
      }
      runner = await prisma.runner.create({
        data: {
          userId:   req.userId!,
          nombre:   parse.data.nombre   ?? '',
          apellido: parse.data.apellido ?? '',
          ciudad:   parse.data.ciudad   ?? 'México',
          ...parse.data,
        },
      });
    }
    return res.json(runner);
  } catch (err: any) {
    console.error('[PUT /runners/me]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Error al actualizar el perfil' });
  }
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
      activityLogs: {
        orderBy: { fecha: 'desc' },
        take: 50,
        // gpxContent excluded — fetched on-demand via GET /:id/activity-logs/:actId
        select: {
          id: true, runnerId: true, diaId: true, fuente: true, nombre: true, tipo: true,
          fecha: true, distanciaKm: true, duracionMin: true, ritmoMinKm: true,
          fcPromedio: true, fcMax: true, cadenciaPromedio: true, cadenciaMax: true,
          elevacionM: true, elevacionPerdidaM: true, caloriasKcal: true,
          potenciaW: true, gpxNombre: true, notas: true,
          confirmadoPorCoach: true, confirmedAt: true, createdAt: true,
        } as any,
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
    pais: z.string().optional(),
    estado: z.string().optional(),
    ciudad: z.string().optional(),
    nivel: z.enum(['principiante', 'intermedio', 'avanzado', 'elite']).optional(),
    genero: z.string().optional(),
    tallaCamiseta: z.string().optional(),
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

router.delete('/:id/permanent', coachOnly, async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({
    where: { id: Number(req.params.id) },
    select: { userId: true },
  });
  if (!runner) return res.status(404).json({ error: 'Corredor no encontrado' });

  await (prisma as any).chatMessage.deleteMany({
    where: { OR: [{ senderId: runner.userId }, { receiverId: runner.userId }] },
  });

  await prisma.user.delete({ where: { id: runner.userId } });
  return res.json({ ok: true });
});

router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  await prisma.runner.update({ where: { id: Number(req.params.id) }, data: { activo: false } });
  return res.json({ ok: true });
});

// ── Activity Logs ─────────────────────────────────────────────────────────────

// Runner sube actividad (GPX + distancia + notas)
router.post('/me/activity-logs', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    diaId:       z.number().int().optional(),
    fecha:       z.string().optional(),
    gpxContent:  z.string().optional(),
    gpxNombre:   z.string().optional(),
    distanciaKm: z.number().optional(),
    duracionMin: z.number().int().optional(),
    notas:       z.string().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });

  const log = await (prisma as any).activityLog.create({
    data: {
      runnerId: runner.id,
      ...parse.data,
      fecha: parse.data.fecha ? new Date(parse.data.fecha) : new Date(),
    },
  });
  return res.status(201).json(log);
});

// Coach ve logs de un corredor
router.get('/:id/activity-logs', coachOnly, async (req: AuthRequest, res: Response) => {
  const logs = await (prisma as any).activityLog.findMany({
    where: { runnerId: Number(req.params.id) },
    orderBy: { fecha: 'desc' },
  });
  return res.json(logs);
});

// Detalle completo de una actividad (incluye gpxContent)
router.get('/:id/activity-logs/:actId', coachOnly, async (req: AuthRequest, res: Response) => {
  const log = await (prisma as any).activityLog.findFirst({
    where: { id: Number(req.params.actId), runnerId: Number(req.params.id) },
  });
  if (!log) return res.status(404).json({ error: 'Actividad no encontrada' });
  return res.json(log);
});

// Coach confirma actividad
router.patch('/:id/activity-logs/:actId/confirm', coachOnly, async (req: AuthRequest, res: Response) => {
  const result = await (prisma as any).activityLog.updateMany({
    where: { id: Number(req.params.actId), runnerId: Number(req.params.id) },
    data: { confirmadoPorCoach: true, confirmedAt: new Date() },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Actividad no encontrada' });
  return res.json({ ok: true });
});

// POST /runners/bulk-email — coach envía email a todos (o un subconjunto) de corredores activos
router.post('/bulk-email', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    subject:    z.string().min(1),
    mensaje:    z.string().min(1),
    runnerIds:  z.array(z.number().int()).optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const { subject, mensaje, runnerIds } = parse.data;

  const runners = await prisma.runner.findMany({
    where: {
      activo: true,
      ...(runnerIds?.length ? { id: { in: runnerIds } } : {}),
    },
    include: { user: { select: { email: true } } },
  });

  const recipients = runners
    .filter(r => (r as any).user?.email)
    .map(r => ({ nombre: `${r.nombre} ${r.apellido}`, email: (r as any).user.email as string }));

  if (!recipients.length) {
    return res.status(400).json({ error: 'No hay corredores con correo electrónico disponible' });
  }

  try {
    await sendBulkUpdate({ recipients, eventName: 'JTZ Running Club', subject, mensaje, coachUserId: req.userId });
    return res.json({ ok: true, sent: recipients.length });
  } catch (err: any) {
    console.error('[bulk-email]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Error al enviar los correos' });
  }
});

export default router;

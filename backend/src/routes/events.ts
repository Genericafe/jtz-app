import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { sendEventNotification, sendGpxToRunner } from '../services/email';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/', async (_req: AuthRequest, res: Response) => {
  const events = await prisma.event.findMany({
    include: { _count: { select: { registros: true } } },
    orderBy: { fecha: 'asc' },
  });
  return res.json(events);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const event = await prisma.event.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      registros: {
        include: {
          runner: {
            select: {
              nombre: true, apellido: true, nivel: true,
              telefono: true, ciudad: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      leads: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(event);
});

router.post('/', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:              z.string(),
    tipo:                z.enum(['carrera', 'trail', 'entrenamiento', 'social']),
    descripcion:         z.string().optional(),
    fecha:               z.string(),
    lugar:               z.string(),
    ciudad:              z.string().optional(),
    estado:              z.string().optional().default(''),
    distanciaKm:         z.number().optional(),
    cupoMaximo:          z.number().int().optional(),
    precio:              z.number().default(0),
    notificarCorredores: z.boolean().optional().default(false),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const { notificarCorredores, ...eventData } = parse.data;

  const event = await prisma.event.create({
    data: { ...eventData, fecha: new Date(eventData.fecha) },
  });

  if (notificarCorredores) {
    const runners = await prisma.runner.findMany({
      where: { activo: true },
      include: { user: { select: { email: true } } },
    });
    const recipients = runners
      .filter(r => r.user?.email)
      .map(r => ({ nombre: r.nombre, email: r.user!.email }));

    sendEventNotification({
      recipients,
      eventId:     event.id,
      eventName:   event.nombre,
      eventDate:   new Date(event.fecha).toLocaleDateString('es-MX', { dateStyle: 'full' }),
      eventPlace:  event.lugar,
      eventCity:   event.ciudad ?? '',
      eventType:   event.tipo,
      distanciaKm: event.distanciaKm ?? null,
      precio:      event.precio,
      coachUserId: req.userId,
    }).catch(err => console.error('[event notification]', err));
  }

  return res.status(201).json(event);
});

router.put('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  const data = { ...req.body };
  if (data.fecha) data.fecha = new Date(data.fecha);
  const event = await prisma.event.update({ where: { id: Number(req.params.id) }, data });
  return res.json(event);
});

router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  await prisma.event.delete({ where: { id: Number(req.params.id) } });
  return res.json({ ok: true });
});

// ── GPX upload (coach) ────────────────────────────────────────────────────────
router.post('/:id/gpx', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    gpxContent: z.string().min(1),
    gpxNombre:  z.string().min(1),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const event = await prisma.event.update({
    where: { id: Number(req.params.id) },
    data: { gpxContent: parse.data.gpxContent, gpxNombre: parse.data.gpxNombre },
    include: {
      registros: {
        where: { pagado: true },
        include: { runner: { include: { user: { select: { email: true } } } } },
      },
      leads: { where: { estado: { in: ['pagado', 'confirmado'] } } },
    },
  });

  // Email GPX to all paid registrants (fire-and-forget)
  const recipients = [
    ...event.registros.map(r => ({ nombre: r.runner.nombre, email: r.runner.user!.email })),
    ...event.leads.map(l => ({ nombre: l.nombre, email: l.email })),
  ];
  const uniqueEmails = new Map(recipients.map(r => [r.email, r]));

  for (const { nombre, email } of uniqueEmails.values()) {
    sendGpxToRunner({
      to: email, nombre,
      eventName: event.nombre,
      gpxContent: parse.data.gpxContent,
      gpxNombre: parse.data.gpxNombre,
      coachUserId: req.userId,
    }).catch(err => console.error('[gpx email]', err));
  }

  return res.json({ ok: true, gpxNombre: event.gpxNombre });
});

// ── GPX download (paid runner or coach) ──────────────────────────────────────
router.get('/:id/gpx', async (req: AuthRequest, res: Response) => {
  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event?.gpxContent) return res.status(404).json({ error: 'Este evento no tiene ruta GPX' });

  // Coach always allowed; runners must be registered+paid
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true, email: true, runner: true } });
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  if (user.role !== 'coach') {
    const runnerId = (user as any).runner?.id;
    const [regOk, leadOk] = await Promise.all([
      runnerId ? prisma.eventRegistration.findFirst({
        where: { eventId: event.id, runnerId, pagado: true },
      }) : null,
      prisma.eventLead.findFirst({
        where: { eventId: event.id, email: user.email, estado: { in: ['pagado', 'confirmado'] } },
      }),
    ]);
    if (!regOk && !leadOk) return res.status(403).json({ error: 'Solo disponible para inscritos pagados' });
  }

  res.setHeader('Content-Type', 'application/gpx+xml');
  res.setHeader('Content-Disposition', `attachment; filename="${event.gpxNombre ?? 'ruta.gpx'}"`);
  return res.send(event.gpxContent);
});

// ── GPX token para QR (válido 1 hora) ────────────────────────────────────────
router.get('/:id/gpx-token', async (req: AuthRequest, res: Response) => {
  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event?.gpxContent) return res.status(404).json({ error: 'Este evento no tiene ruta GPX' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true, email: true, runner: true } });
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  if (user.role !== 'coach') {
    const runnerId = (user as any).runner?.id;
    const [regOk, leadOk] = await Promise.all([
      runnerId ? prisma.eventRegistration.findFirst({ where: { eventId: event.id, runnerId, pagado: true } }) : null,
      prisma.eventLead.findFirst({ where: { eventId: event.id, email: user.email, estado: { in: ['pagado', 'confirmado'] } } }),
    ]);
    if (!regOk && !leadOk) return res.status(403).json({ error: 'Solo disponible para inscritos pagados' });
  }

  const secret = process.env.JWT_SECRET ?? 'jtz-secret';
  const token = jwt.sign({ eventId: event.id, gpx: true }, secret, { expiresIn: '1h' });
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
  const url = `${backendUrl}/api/public/gpx/${event.id}?token=${token}`;
  return res.json({ url, gpxNombre: event.gpxNombre });
});

router.post('/:id/register', async (req: AuthRequest, res: Response) => {
  const schema = z.object({ runnerId: z.number().int() });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const reg = await prisma.eventRegistration.upsert({
    where: { eventId_runnerId: { eventId: Number(req.params.id), runnerId: parse.data.runnerId } },
    update: { estado: 'inscrito' },
    create: { eventId: Number(req.params.id), runnerId: parse.data.runnerId },
  });
  return res.json(reg);
});

export default router;

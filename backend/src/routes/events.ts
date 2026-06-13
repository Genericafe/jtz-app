import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { sendEventNotification } from '../services/email';
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

import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { sendBulkUpdate } from '../services/email';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware, coachOnly);

// All leads for an event
router.get('/events/:id/leads', async (req: AuthRequest, res: Response) => {
  const leads = await prisma.eventLead.findMany({
    where: { eventId: Number(req.params.id) },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(leads);
});

// Export leads as CSV
router.get('/events/:id/leads/export', async (req: AuthRequest, res: Response) => {
  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  const leads = await prisma.eventLead.findMany({ where: { eventId: Number(req.params.id) } });

  const rows = [
    ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Ciudad', 'Estado', 'Monto', 'Fecha'],
    ...leads.map(l => [l.nombre, l.apellido, l.email, l.telefono ?? '', l.ciudad ?? '', l.estado, l.monto, new Date(l.createdAt).toLocaleDateString('es-MX')]),
  ];
  const csv = rows.map(r => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="inscritos-${event?.nombre ?? req.params.id}.csv"`);
  return res.send(csv);
});

// Send bulk email — leads (landing) + registrations (app), deduplicated
router.post('/events/:id/broadcast', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    subject: z.string().min(1),
    mensaje: z.string().min(1),
    soloConfirmados: z.boolean().default(false),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

  const [leads, registrations] = await Promise.all([
    prisma.eventLead.findMany({
      where: {
        eventId: Number(req.params.id),
        ...(parse.data.soloConfirmados ? { estado: { in: ['confirmado', 'pagado'] } } : {}),
      },
    }),
    prisma.eventRegistration.findMany({
      where: {
        eventId: Number(req.params.id),
        ...(parse.data.soloConfirmados ? { pagado: true } : {}),
      },
      include: { runner: { include: { user: { select: { email: true } } } } },
    }),
  ]);

  // Deduplicate by email (app registrations take priority for name)
  const recipientMap = new Map<string, { nombre: string; email: string }>();
  leads.forEach(l => recipientMap.set(l.email, { nombre: l.nombre, email: l.email }));
  registrations.forEach(r => {
    if (r.runner.user?.email)
      recipientMap.set(r.runner.user.email, { nombre: r.runner.nombre, email: r.runner.user.email });
  });

  const recipients = Array.from(recipientMap.values());
  if (recipients.length === 0) return res.status(400).json({ error: 'No hay inscritos para notificar' });

  await sendBulkUpdate({
    recipients,
    eventName: event.nombre,
    subject: parse.data.subject,
    mensaje: parse.data.mensaje,
    coachUserId: req.userId,
  });

  return res.json({ ok: true, sent: recipients.length });
});

// Update lead status manually
router.put('/leads/:id', async (req: AuthRequest, res: Response) => {
  const data: { estado?: string; dorsal?: number | null } = {};
  if (typeof req.body.estado === 'string') data.estado = req.body.estado;
  if (req.body.dorsal !== undefined) data.dorsal = req.body.dorsal === null || req.body.dorsal === '' ? null : Number(req.body.dorsal);
  const lead = await prisma.eventLead.update({
    where: { id: Number(req.params.id) },
    data,
  });
  // Keep the live session's dorsal in sync if it exists
  if (data.dorsal !== undefined) {
    await prisma.eventLiveSession.updateMany({ where: { leadId: lead.id }, data: { dorsal: data.dorsal } }).catch(() => {});
  }
  return res.json(lead);
});

// Delete lead
router.delete('/leads/:id', async (req: AuthRequest, res: Response) => {
  await prisma.eventLead.delete({ where: { id: Number(req.params.id) } });
  return res.json({ ok: true });
});

export default router;

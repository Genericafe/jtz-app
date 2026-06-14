import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
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

// AI email generator
router.post('/events/:id/generate-email', async (req: AuthRequest, res: Response) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt requerido' });

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'API de IA no configurada' });

  const client = new Anthropic({ apiKey });
  const diasAlEvento = Math.ceil((new Date(event.fecha).getTime() - Date.now()) / 86400000);
  const fechaStr = new Date(event.fecha).toLocaleDateString('es-MX', { dateStyle: 'full', timeZone: 'America/Tijuana' });

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Eres el asistente de comunicación de JTZ Running Club.

Evento: ${event.nombre}
Fecha: ${fechaStr} (en ${diasAlEvento} días)
Lugar: ${event.lugar}${event.ciudad ? `, ${event.ciudad}` : ''}
${event.distanciaKm ? `Distancia: ${event.distanciaKm} km` : ''}

El coach quiere comunicar: "${prompt}"

Genera un correo motivador y profesional para los corredores inscritos en español mexicano.
Responde ÚNICAMENTE con JSON válido (sin markdown, sin código, sin explicaciones):
{"asunto":"...","mensaje":"..."}`
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch?.[0] ?? text);
    return res.json(result);
  } catch (err) {
    console.error('[generate-email]', err);
    return res.status(500).json({ error: 'Error generando el mensaje' });
  }
});

// Update lead status manually
router.put('/leads/:id', async (req: AuthRequest, res: Response) => {
  const lead = await prisma.eventLead.update({
    where: { id: Number(req.params.id) },
    data: { estado: req.body.estado },
  });
  return res.json(lead);
});

// Delete lead
router.delete('/leads/:id', async (req: AuthRequest, res: Response) => {
  await prisma.eventLead.delete({ where: { id: Number(req.params.id) } });
  return res.json({ ok: true });
});

export default router;

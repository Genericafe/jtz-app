import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { sendRegistrationConfirmation } from '../services/email';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const router = Router();
const prisma = new PrismaClient();

// ── GPX público con token firmado (para QR) ───────────────────────────────────
router.get('/gpx/:eventId', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) return res.status(401).send('Token requerido');

  try {
    const secret = process.env.JWT_SECRET ?? 'jtz-secret';
    const payload = jwt.verify(token, secret) as { eventId: number; gpx: boolean };
    if (!payload.gpx || payload.eventId !== Number(req.params.eventId)) {
      return res.status(403).send('Token inválido');
    }
  } catch {
    return res.status(403).send('Token expirado o inválido');
  }

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.eventId) } });
  if (!event?.gpxContent) return res.status(404).send('GPX no encontrado');

  res.setHeader('Content-Type', 'application/gpx+xml');
  res.setHeader('Content-Disposition', `attachment; filename="${event.gpxNombre ?? 'ruta.gpx'}"`);
  return res.send(event.gpxContent);
});

// Public event info (no auth)
router.get('/events/:id', async (req: Request, res: Response) => {
  const event = await prisma.event.findUnique({
    where: { id: Number(req.params.id), activo: true },
    include: { _count: { select: { leads: true, registros: true } } },
  });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(event);
});

// ── Event image — public, real URL for <img> and Open Graph previews ──────────
router.get('/events/:id/image', async (req: Request, res: Response) => {
  const event = await prisma.event.findUnique({
    where: { id: Number(req.params.id) },
    select: { imagen: true },
  });
  const raw = event?.imagen;
  if (!raw) return res.status(404).end();

  // Stored as a data URL ("data:image/jpeg;base64,...") or bare base64.
  const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  const mime = m ? m[1] : 'image/jpeg';
  const b64  = m ? m[2] : raw;
  try {
    const buf = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(buf);
  } catch {
    return res.status(404).end();
  }
});

const leadSchema = z.object({
  nombre:          z.string().min(1),
  apellido:        z.string().min(1),
  email:           z.string().email(),
  telefono:        z.string().optional(),
  ciudad:          z.string().optional(),
  fechaNacimiento: z.string().optional(),
  tallaPlayera:    z.string().optional(),
  fuente:          z.string().optional(),
  utmSource:       z.string().optional(),
  utmMedium:       z.string().optional(),
  utmCampaign:     z.string().optional(),
});

// Free event registration
router.post('/events/:id/register', async (req: Request, res: Response) => {
  const parse = leadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.precio > 0) return res.status(400).json({ error: 'Este evento requiere pago' });

  const { fechaNacimiento, ...leadRest } = parse.data;
  const lead = await prisma.eventLead.upsert({
    where: { eventId_email: { eventId: event.id, email: parse.data.email } },
    update: { estado: 'confirmado' },
    create: {
      ...leadRest,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : undefined,
      eventId: event.id,
      estado: 'confirmado',
      monto: 0,
    },
  });

  // Send confirmation email (fire-and-forget)
  sendRegistrationConfirmation({
    to: parse.data.email,
    nombre: parse.data.nombre,
    eventName: event.nombre,
    eventDate: format(new Date(event.fecha), "EEEE d 'de' MMMM · HH:mm 'hrs'", { locale: es }),
    eventPlace: event.lugar,
    eventCity: event.ciudad,
    distanciaKm: event.distanciaKm,
    precio: 0,
    tipo: event.tipo,
  }).catch(console.error);

  return res.status(201).json({ ok: true, lead });
});

// Paid event — create Stripe checkout
router.post('/events/:id/checkout', async (req: Request, res: Response) => {
  const parse = leadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.precio <= 0) return res.status(400).json({ error: 'Este evento es gratuito' });

  // Create or update lead as pending
  const { fechaNacimiento: fnPaid, ...leadRestPaid } = parse.data;
  const lead = await prisma.eventLead.upsert({
    where: { eventId_email: { eventId: event.id, email: parse.data.email } },
    update: { ...leadRestPaid, fechaNacimiento: fnPaid ? new Date(fnPaid) : undefined, estado: 'pendiente' },
    create: {
      ...leadRestPaid,
      fechaNacimiento: fnPaid ? new Date(fnPaid) : undefined,
      eventId: event.id,
      estado: 'pendiente',
      monto: event.precio,
    },
  });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.includes('REEMPLAZA') || stripeKey.length < 20) {
    return res.status(503).json({ error: 'El pago con tarjeta no está disponible en este momento. Contacta al coach para inscribirte.' });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: parse.data.email,
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `Inscripción — ${event.nombre}`,
            description: `${event.lugar}, ${event.ciudad} · ${format(new Date(event.fecha), "d 'de' MMMM", { locale: es })}`,
          },
          unit_amount: Math.round(event.precio * 100),
        },
        quantity: 1,
      }],
      metadata: { leadId: lead.id.toString(), eventId: event.id.toString() },
      success_url: `${process.env.FRONTEND_URL}/evento/${event.id}?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/evento/${event.id}?cancelled=1`,
    });
    return res.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar el pago';
    return res.status(500).json({ error: `Error al crear la sesión de pago: ${msg}` });
  }
});

// Stripe webhook — confirm lead payment
router.post('/webhook/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Sin firma');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return res.status(400).send('Webhook inválido');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const leadId = session.metadata?.leadId;
    if (leadId) {
      const lead = await prisma.eventLead.update({
        where: { id: Number(leadId) },
        data: { estado: 'pagado', stripeSessionId: session.id },
        include: { event: true },
      });

      // Link to runner account if email matches
      const user = await prisma.user.findUnique({ where: { email: lead.email }, include: { runner: true } });
      if (user?.runner) {
        await prisma.eventRegistration.upsert({
          where: { eventId_runnerId: { eventId: lead.eventId, runnerId: user.runner.id } },
          update: { pagado: true, estado: 'pagado' },
          create: { eventId: lead.eventId, runnerId: user.runner.id, pagado: true, estado: 'pagado' },
        });
      }

      sendRegistrationConfirmation({
        to: lead.email,
        nombre: lead.nombre,
        eventName: lead.event.nombre,
        eventDate: format(new Date(lead.event.fecha), "EEEE d 'de' MMMM · HH:mm 'hrs'", { locale: es }),
        eventPlace: lead.event.lugar,
        eventCity: lead.event.ciudad,
        distanciaKm: lead.event.distanciaKm,
        precio: lead.event.precio,
        tipo: lead.event.tipo,
      }).catch(console.error);
    }
  }
  return res.json({ received: true });
});

// Verify Stripe session and confirm lead
router.get('/verify/:sessionId', async (req: Request, res: Response) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion });
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (session.payment_status === 'paid' && session.metadata?.leadId) {
      const lead = await prisma.eventLead.update({
        where: { id: Number(session.metadata.leadId) },
        data: { estado: 'pagado', stripeSessionId: session.id },
        include: { event: true },
      });

      // Link to runner account if email matches
      const user = await prisma.user.findUnique({ where: { email: lead.email }, include: { runner: true } });
      if (user?.runner) {
        await prisma.eventRegistration.upsert({
          where: { eventId_runnerId: { eventId: lead.eventId, runnerId: user.runner.id } },
          update: { pagado: true, estado: 'pagado' },
          create: { eventId: lead.eventId, runnerId: user.runner.id, pagado: true, estado: 'pagado' },
        });
      }

      sendRegistrationConfirmation({
        to: lead.email,
        nombre: lead.nombre,
        eventName: lead.event.nombre,
        eventDate: format(new Date(lead.event.fecha), "EEEE d 'de' MMMM · HH:mm 'hrs'", { locale: es }),
        eventPlace: lead.event.lugar,
        eventCity: lead.event.ciudad,
        distanciaKm: lead.event.distanciaKm,
        precio: lead.event.precio,
        tipo: lead.event.tipo,
      }).catch(console.error);
      return res.json({ ok: true, lead });
    }
    return res.json({ ok: false });
  } catch {
    return res.status(400).json({ ok: false });
  }
});

export default router;

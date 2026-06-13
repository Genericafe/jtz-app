import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { z } from 'zod';
import { sendRegistrationConfirmation } from '../services/email';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const router = Router();
const prisma = new PrismaClient();

// Public event info (no auth)
router.get('/events/:id', async (req: Request, res: Response) => {
  const event = await prisma.event.findUnique({
    where: { id: Number(req.params.id), activo: true },
    include: { _count: { select: { leads: true, registros: true } } },
  });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(event);
});

const leadSchema = z.object({
  nombre:   z.string().min(1),
  apellido: z.string().min(1),
  email:    z.string().email(),
  telefono: z.string().optional(),
  ciudad:   z.string().optional(),
});

// Free event registration
router.post('/events/:id/register', async (req: Request, res: Response) => {
  const parse = leadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.precio > 0) return res.status(400).json({ error: 'Este evento requiere pago' });

  const lead = await prisma.eventLead.upsert({
    where: { eventId_email: { eventId: event.id, email: parse.data.email } },
    update: { estado: 'confirmado' },
    create: { ...parse.data, eventId: event.id, estado: 'confirmado', monto: 0 },
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
  const lead = await prisma.eventLead.upsert({
    where: { eventId_email: { eventId: event.id, email: parse.data.email } },
    update: { ...parse.data, estado: 'pendiente' },
    create: { ...parse.data, eventId: event.id, estado: 'pendiente', monto: event.precio },
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

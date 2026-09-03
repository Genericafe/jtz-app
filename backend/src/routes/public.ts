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

// Confirmation emails are sent FROM the coach's configured address. Prefer the
// user who actually has a VERIFIED email config (so getSender succeeds even if
// several 'coach' users exist), falling back to the first coach.
async function coachUserId(): Promise<number | undefined> {
  const verified = await prisma.emailConfig.findFirst({
    where: { verified: true }, select: { userId: true }, orderBy: { updatedAt: 'desc' },
  });
  if (verified) return verified.userId;
  const coach = await prisma.user.findFirst({ where: { role: 'coach' }, select: { id: true } });
  return coach?.id ?? undefined;
}

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
    include: {
      _count: { select: { leads: true, registros: true } },
      categorias: { orderBy: { orden: 'asc' } },
    },
  });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(event);
});

// Public list of active events (no auth) — for the public club site
router.get('/events', async (_req: Request, res: Response) => {
  const events = await prisma.event.findMany({
    where: { activo: true },
    orderBy: { fecha: 'asc' },
    include: { _count: { select: { registros: true } }, categorias: { orderBy: { orden: 'asc' } } },
  });
  return res.json(events);
});

// Public site config (landing photos) — no auth
router.get('/site', async (_req: Request, res: Response) => {
  const cfg = await (prisma as any).siteConfig.findUnique({ where: { id: 1 } });
  return res.json(cfg ?? {});
});

// Public list of active store products (no auth)
router.get('/products', async (_req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    where: { activo: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(products);
});

// ── Public live tracking (spectator) — only sessions the runner made public ───
// List of runners currently sharing their run publicly (for search).
router.get('/live', async (_req: Request, res: Response) => {
  const cutoff = new Date(Date.now() - 90_000);
  const sessions = await (prisma as any).liveSession.findMany({
    where: { activo: true, publico: true, lastUpdate: { gte: cutoff } },
    include: { runner: { select: { id: true, nombre: true, apellido: true } } },
    orderBy: { lastUpdate: 'desc' },
  });
  return res.json(sessions.map((s: any) => ({
    runnerId: s.runnerId,
    nombre: `${s.runner.nombre} ${s.runner.apellido}`.trim(),
    tipo: s.tipo, distanciaKm: s.distanciaKm, lastUpdate: s.lastUpdate,
  })));
});

// One public runner's live position + trail (only if they made it public).
router.get('/live/:runnerId', async (req: Request, res: Response) => {
  const s = await (prisma as any).liveSession.findUnique({
    where: { runnerId: Number(req.params.runnerId) },
    include: { runner: { select: { nombre: true, apellido: true } } },
  });
  if (!s || !s.publico) return res.status(404).json({ error: 'No disponible' });
  let trail: number[][] = [];
  try { trail = JSON.parse(s.trail ?? '[]'); } catch { trail = []; }
  return res.json({
    runnerId: s.runnerId, nombre: `${s.runner.nombre} ${s.runner.apellido}`.trim(),
    activo: s.activo, tipo: s.tipo, startedAt: s.startedAt, lastUpdate: s.lastUpdate,
    lat: s.lastLat, lng: s.lastLng, distanciaKm: s.distanciaKm, trail,
    stale: Date.now() - new Date(s.lastUpdate).getTime() > 90_000,
  });
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
  categoriaId:     z.number().int().optional(),
});

// Resolve the effective price + category for a registration.
async function resolveCategory(eventId: number, precioEvento: number, categoriaId?: number) {
  if (categoriaId) {
    const cat = await (prisma as any).eventCategory.findUnique({ where: { id: categoriaId } });
    if (cat && cat.eventId === eventId) {
      return { precio: cat.precio as number, categoria: cat.nombre as string, categoriaId };
    }
  }
  return { precio: precioEvento, categoria: null as string | null, categoriaId: null as number | null };
}

// Free event registration
router.post('/events/:id/register', async (req: Request, res: Response) => {
  const parse = leadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

  const cat = await resolveCategory(event.id, event.precio, parse.data.categoriaId);
  if (cat.precio > 0) return res.status(400).json({ error: 'Esta categoría requiere pago' });

  const { fechaNacimiento, categoriaId: _cid, ...leadRest } = parse.data;
  const lead = await prisma.eventLead.upsert({
    where: { eventId_email: { eventId: event.id, email: parse.data.email } },
    update: { estado: 'confirmado', categoria: cat.categoria, categoriaId: cat.categoriaId, monto: 0 },
    create: {
      ...leadRest,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : undefined,
      eventId: event.id,
      estado: 'confirmado',
      monto: 0,
      categoria: cat.categoria,
      categoriaId: cat.categoriaId,
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
    coachUserId: await coachUserId(),
  }).catch(console.error);

  const dorsal = await assignDorsal(event.id, lead.id);
  return res.status(201).json({ ok: true, lead, dorsal, participantUrl: participantUrl(lead.id, event.id) });
});

// Paid event — create Stripe checkout
router.post('/events/:id/checkout', async (req: Request, res: Response) => {
  const parse = leadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const event = await prisma.event.findUnique({ where: { id: Number(req.params.id) } });
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

  const cat = await resolveCategory(event.id, event.precio, parse.data.categoriaId);
  if (cat.precio <= 0) return res.status(400).json({ error: 'Esta categoría es gratuita' });

  // Create or update lead as pending
  const { fechaNacimiento: fnPaid, categoriaId: _cid2, ...leadRestPaid } = parse.data;
  const lead = await prisma.eventLead.upsert({
    where: { eventId_email: { eventId: event.id, email: parse.data.email } },
    update: { ...leadRestPaid, fechaNacimiento: fnPaid ? new Date(fnPaid) : undefined, estado: 'pendiente', categoria: cat.categoria, categoriaId: cat.categoriaId, monto: cat.precio },
    create: {
      ...leadRestPaid,
      fechaNacimiento: fnPaid ? new Date(fnPaid) : undefined,
      eventId: event.id,
      estado: 'pendiente',
      monto: cat.precio,
      categoria: cat.categoria,
      categoriaId: cat.categoriaId,
    },
  });

  await assignDorsal(event.id, lead.id);

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
            name: `Inscripción — ${event.nombre}${cat.categoria ? ` · ${cat.categoria}` : ''}`,
            description: `${event.lugar}, ${event.ciudad} · ${format(new Date(event.fecha), "d 'de' MMMM", { locale: es })}`,
          },
          unit_amount: Math.round(cat.precio * 100),
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

// ── Public store — guest checkout (compra SIN cuenta) ────────────────────────
const storeCheckoutSchema = z.object({
  items: z.array(z.object({ productId: z.number().int(), cantidad: z.number().int().positive() })).min(1),
  email: z.string().email().optional(),
});

// Mark an order paid and fill guest details + shipping from the Stripe session.
async function fulfillOrder(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;
  const existing = await prisma.order.findUnique({ where: { id: Number(orderId) }, include: { items: true } });
  if (!existing || existing.estado === 'pagado') return;

  const cd = session.customer_details;
  const ship = (session as any).shipping_details ?? (session as any).shipping ?? null;
  const addr = ship?.address ?? cd?.address ?? null;
  const direccion = addr ? [addr.line1, addr.line2, addr.postal_code, addr.state].filter(Boolean).join(', ') : null;

  await prisma.order.update({
    where: { id: Number(orderId) },
    data: {
      estado: 'pagado',
      stripeSessionId: session.id,
      guestNombre:   ship?.name ?? cd?.name ?? existing.guestNombre,
      guestEmail:    cd?.email ?? existing.guestEmail,
      guestTelefono: cd?.phone ?? existing.guestTelefono,
      guestDireccion: direccion ?? existing.guestDireccion,
      guestCiudad:   addr?.city ?? existing.guestCiudad,
    },
  });

  // Discount stock for each purchased item
  for (const it of existing.items) {
    await prisma.product.update({
      where: { id: it.productId },
      data: { stock: { decrement: it.cantidad } },
    }).catch(() => {});
  }
}

router.post('/store/checkout', async (req: Request, res: Response) => {
  const parse = storeCheckoutSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const ids = parse.data.items.map(i => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: ids }, activo: true } });
  if (products.length === 0) return res.status(400).json({ error: 'No hay productos válidos en el carrito' });

  // Build line items + total from SERVER-SIDE prices (never trust the client)
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const orderItems: { productId: number; cantidad: number; precioUnit: number }[] = [];
  let total = 0;
  for (const item of parse.data.items) {
    const p = products.find(pr => pr.id === item.productId);
    if (!p) continue;
    if (p.stock <= 0) return res.status(400).json({ error: `"${p.nombre}" está agotado` });
    const qty = Math.min(item.cantidad, p.stock);
    total += p.precio * qty;
    orderItems.push({ productId: p.id, cantidad: qty, precioUnit: p.precio });
    lineItems.push({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: p.nombre,
          description: [p.talla ? `Talla ${p.talla}` : null, p.color].filter(Boolean).join(' · ') || undefined,
          images: p.imagen && p.imagen.startsWith('http') ? [p.imagen] : undefined,
        },
        unit_amount: Math.round(p.precio * 100),
      },
      quantity: qty,
    });
  }
  if (orderItems.length === 0) return res.status(400).json({ error: 'No hay productos válidos en el carrito' });

  const order = await prisma.order.create({
    data: { total, estado: 'pendiente', guestEmail: parse.data.email, items: { create: orderItems } },
  });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.includes('REEMPLAZA') || stripeKey.length < 20) {
    return res.status(503).json({ error: 'El pago con tarjeta no está disponible en este momento. Contacta al coach.' });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: parse.data.email,
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ['MX', 'US'] },
      metadata: { orderId: order.id.toString() },
      success_url: `${process.env.FRONTEND_URL}/tienda-publica?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/tienda-publica?cancelled=1`,
    });
    await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return res.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar el pago';
    return res.status(500).json({ error: `Error al crear la sesión de pago: ${msg}` });
  }
});

// ── Participantes de carrera: acceso temporal por LINK MÁGICO ────────────────
const PARTICIPANT_SECRET = () => process.env.JWT_SECRET ?? 'jtz-secret';

function participantToken(leadId: number, eventId: number): string {
  return jwt.sign({ type: 'participant', leadId, eventId }, PARTICIPANT_SECRET(), { expiresIn: '30d' });
}
function participantUrl(leadId: number, eventId: number): string {
  return `${process.env.FRONTEND_URL}/correr/${participantToken(leadId, eventId)}`;
}
function verifyParticipant(token: string): { leadId: number; eventId: number } | null {
  try {
    const p = jwt.verify(token, PARTICIPANT_SECRET()) as any;
    if (p?.type !== 'participant') return null;
    return { leadId: Number(p.leadId), eventId: Number(p.eventId) };
  } catch { return null; }
}
// Auto-assign the next sequential dorsal for an event (idempotent per lead).
async function assignDorsal(eventId: number, leadId: number): Promise<number | null> {
  const lead = await prisma.eventLead.findUnique({ where: { id: leadId } });
  if (lead?.dorsal) return lead.dorsal;
  const max = await prisma.eventLead.aggregate({ where: { eventId, dorsal: { not: null } }, _max: { dorsal: true } });
  const next = (max._max.dorsal ?? 0) + 1;
  await prisma.eventLead.update({ where: { id: leadId }, data: { dorsal: next } });
  return next;
}

// Resolve a magic-link token → event + participant info (for the recording page)
router.get('/participant/:token', async (req: Request, res: Response) => {
  const p = verifyParticipant(req.params.token);
  if (!p) return res.status(403).json({ error: 'Enlace inválido o expirado' });
  const lead = await prisma.eventLead.findUnique({ where: { id: p.leadId }, include: { event: true } });
  if (!lead) return res.status(404).json({ error: 'Inscripción no encontrada' });
  return res.json({
    eventId: lead.eventId, eventNombre: lead.event.nombre, fecha: lead.event.fecha,
    lugar: lead.event.lugar, ciudad: lead.event.ciudad, tipo: lead.event.tipo,
    leadId: lead.id, nombre: `${lead.nombre} ${lead.apellido}`.trim(), dorsal: lead.dorsal,
  });
});

// Participant: start / update / stop their live session
router.post('/participant/:token/start', async (req: Request, res: Response) => {
  const p = verifyParticipant(req.params.token);
  if (!p) return res.status(403).json({ error: 'Enlace inválido' });
  const lead = await prisma.eventLead.findUnique({ where: { id: p.leadId } });
  if (!lead) return res.status(404).json({ error: 'No encontrado' });
  const tipo = (req.body?.tipo as string) || 'correr';
  const nombre = `${lead.nombre} ${lead.apellido}`.trim();
  const s = await prisma.eventLiveSession.upsert({
    where: { leadId: lead.id },
    update: { activo: true, endedAt: null, startedAt: new Date(), lastUpdate: new Date(), distanciaKm: 0, trail: '[]', tipo, nombre, dorsal: lead.dorsal, eventId: lead.eventId },
    create: { leadId: lead.id, eventId: lead.eventId, nombre, dorsal: lead.dorsal, tipo, trail: '[]' },
  });
  return res.json({ ok: true, id: s.id });
});

router.post('/participant/:token/ping', async (req: Request, res: Response) => {
  const p = verifyParticipant(req.params.token);
  if (!p) return res.status(403).json({ error: 'Enlace inválido' });
  const { lat, lng, trail, distanciaKm } = req.body ?? {};
  await prisma.eventLiveSession.update({
    where: { leadId: p.leadId },
    data: {
      lastLat: typeof lat === 'number' ? lat : undefined,
      lastLng: typeof lng === 'number' ? lng : undefined,
      trail: typeof trail === 'string' ? trail : (Array.isArray(trail) ? JSON.stringify(trail) : undefined),
      distanciaKm: typeof distanciaKm === 'number' ? distanciaKm : undefined,
      lastUpdate: new Date(), activo: true,
    },
  }).catch(() => {});
  return res.json({ ok: true });
});

router.post('/participant/:token/stop', async (req: Request, res: Response) => {
  const p = verifyParticipant(req.params.token);
  if (!p) return res.status(403).json({ error: 'Enlace inválido' });
  await prisma.eventLiveSession.update({ where: { leadId: p.leadId }, data: { activo: false, endedAt: new Date() } }).catch(() => {});
  return res.json({ ok: true });
});

// Recover a participant's magic link by email (race-day access without the email)
router.post('/events/:id/participant-link', async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Correo requerido' });
  const lead = await prisma.eventLead.findUnique({ where: { eventId_email: { eventId: Number(req.params.id), email } } });
  if (!lead) return res.status(404).json({ error: 'No encontramos una inscripción con ese correo para este evento.' });
  const dorsal = await assignDorsal(lead.eventId, lead.id);
  return res.json({ url: participantUrl(lead.id, lead.eventId), nombre: `${lead.nombre} ${lead.apellido}`.trim(), dorsal });
});

// Spectator: list participants currently sharing live for this event (search by name/number)
router.get('/events/:id/live', async (req: Request, res: Response) => {
  const eventId = Number(req.params.id);
  const sessions = await prisma.eventLiveSession.findMany({
    where: { eventId, activo: true }, orderBy: { lastUpdate: 'desc' },
  });
  const now = Date.now();
  return res.json(sessions.map(s => ({
    leadId: s.leadId, nombre: s.nombre, dorsal: s.dorsal, tipo: s.tipo,
    distanciaKm: s.distanciaKm, lastUpdate: s.lastUpdate,
    stale: now - new Date(s.lastUpdate).getTime() > 120_000,
  })));
});

// Spectator: one participant's live route
router.get('/events/:id/live/:leadId', async (req: Request, res: Response) => {
  const s = await prisma.eventLiveSession.findUnique({ where: { leadId: Number(req.params.leadId) } });
  if (!s || s.eventId !== Number(req.params.id)) return res.status(404).json({ error: 'No disponible' });
  let trail: number[][] = [];
  try { trail = JSON.parse(s.trail ?? '[]'); } catch { trail = []; }
  return res.json({
    leadId: s.leadId, nombre: s.nombre, dorsal: s.dorsal, tipo: s.tipo,
    activo: s.activo, startedAt: s.startedAt, lastUpdate: s.lastUpdate,
    lat: s.lastLat, lng: s.lastLng, distanciaKm: s.distanciaKm, trail,
    stale: Date.now() - new Date(s.lastUpdate).getTime() > 120_000,
  });
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
    // Store order (guest checkout)
    if (session.metadata?.orderId) {
      await fulfillOrder(session).catch(console.error);
    }
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
        coachUserId: await coachUserId(),
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

    // Store order (guest checkout)
    if (session.payment_status === 'paid' && session.metadata?.orderId) {
      await fulfillOrder(session).catch(console.error);
      return res.json({ ok: true, tipo: 'pedido' });
    }

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
        coachUserId: await coachUserId(),
      }).catch(console.error);
      const dorsal = await assignDorsal(lead.eventId, lead.id);
      return res.json({ ok: true, lead, dorsal, participantUrl: participantUrl(lead.id, lead.eventId) });
    }
    return res.json({ ok: false });
  } catch {
    return res.status(400).json({ ok: false });
  }
});

export default router;

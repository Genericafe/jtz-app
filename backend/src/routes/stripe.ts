import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion });
}

const frontendUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim();

// ── Checkout para un pago pendiente (membresías, cuotas, etc.) ────────────────
router.post('/checkout/:paymentId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const payment = await prisma.payment.findUnique({
    where: { id: Number(req.params.paymentId) },
    include: { runner: { select: { nombre: true, apellido: true, userId: true } } },
  });

  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  if (payment.estado === 'pagado') return res.status(400).json({ error: 'Este pago ya fue completado' });

  if (req.userRole === 'runner' && payment.runner?.userId !== req.userId) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `JTZ — ${payment.concepto.replace('_', ' ')}`,
            description: `Pago para ${payment.runner?.nombre} ${payment.runner?.apellido}`,
          },
          unit_amount: Math.round(payment.monto * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { paymentId: payment.id.toString(), type: 'payment' },
    success_url: `${frontendUrl()}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&payment_id=${payment.id}`,
    cancel_url: `${frontendUrl()}/pagos`,
  });

  return res.json({ url: session.url });
});

// ── Checkout para una orden de la tienda ──────────────────────────────────────
// Crea la orden en DB y redirige a Stripe en un solo paso
router.post('/checkout/order', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== 'runner') return res.status(403).json({ error: 'Solo corredores pueden comprar en la tienda' });

  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil de corredor no encontrado' });

  const { items, notas } = req.body as {
    items: { productId: number; cantidad: number }[];
    notas?: string;
  };

  if (!items?.length) return res.status(400).json({ error: 'El pedido no tiene artículos' });

  // Validar productos y stock
  const productIds = items.map(i => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, activo: true } });

  if (products.length !== productIds.length) {
    return res.status(400).json({ error: 'Uno o más productos no están disponibles' });
  }

  for (const item of items) {
    const product = products.find(p => p.id === item.productId)!;
    if (product.stock < item.cantidad) {
      return res.status(400).json({ error: `Stock insuficiente para "${product.nombre}" (disponible: ${product.stock})` });
    }
  }

  const total = items.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId)!;
    return sum + product.precio * item.cantidad;
  }, 0);

  // Crear la orden en DB (estado pendiente hasta confirmar pago)
  const order = await prisma.order.create({
    data: {
      runnerId: runner.id,
      estado: 'pendiente',
      total,
      notas: notas ?? null,
      items: {
        create: items.map(item => {
          const product = products.find(p => p.id === item.productId)!;
          return { productId: item.productId, cantidad: item.cantidad, precioUnit: product.precio };
        }),
      },
    },
  });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe no está configurado. Contacta al coach.' });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: items.map(item => {
      const product = products.find(p => p.id === item.productId)!;
      return {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: product.nombre,
            description: [product.talla && `Talla ${product.talla}`, product.color].filter(Boolean).join(' · ') || undefined,
            ...(product.imagen ? { images: [] } : {}),
          },
          unit_amount: Math.round(product.precio * 100),
        },
        quantity: item.cantidad,
      };
    }),
    metadata: { orderId: order.id.toString(), type: 'order' },
    success_url: `${frontendUrl()}/tienda?order_success=1&session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
    cancel_url: `${frontendUrl()}/tienda?order_cancelled=1`,
  });

  // Guardar el session ID en la orden
  await prisma.order.update({
    where: { id: order.id },
    data: { stripeSessionId: session.id } as any,
  });

  return res.json({ url: session.url, orderId: order.id });
});

// ── Verificar pago de un pago pendiente (membresías, etc.) ───────────────────
router.get('/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { session_id, payment_id } = req.query as { session_id: string; payment_id: string };
  if (!session_id || !payment_id) return res.status(400).json({ error: 'Parámetros faltantes' });

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(session_id);

  if (session.payment_status === 'paid') {
    await prisma.payment.update({
      where: { id: Number(payment_id) },
      data: { estado: 'pagado', fechaPago: new Date() },
    });
    return res.json({ ok: true, status: 'pagado' });
  }

  return res.json({ ok: false, status: session.payment_status });
});

// ── Verificar pago de una orden de tienda ─────────────────────────────────────
router.get('/verify-order', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { session_id, order_id } = req.query as { session_id: string; order_id: string };
  if (!session_id || !order_id) return res.status(400).json({ error: 'Parámetros faltantes' });

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(session_id);

  if (session.payment_status === 'paid') {
    const order = await prisma.order.update({
      where: { id: Number(order_id) },
      data: { estado: 'pagado' },
      include: { items: { include: { product: { select: { nombre: true } } } } },
    });
    return res.json({ ok: true, status: 'pagado', order });
  }

  return res.json({ ok: false, status: session.payment_status });
});

// ── Webhook de Stripe (maneja pagos Y órdenes de tienda) ─────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Sin firma');

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return res.status(400).send('Webhook inválido');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { type, paymentId, orderId } = session.metadata ?? {};

    if (type === 'order' && orderId) {
      // Orden de tienda
      await prisma.order.update({
        where: { id: Number(orderId) },
        data: { estado: 'pagado' },
      }).catch(() => {});
    } else if (paymentId) {
      // Pago de membresía / cuota
      await prisma.payment.update({
        where: { id: Number(paymentId) },
        data: { estado: 'pagado', fechaPago: new Date() },
      }).catch(() => {});
    }
  }

  return res.json({ received: true });
});

export default router;

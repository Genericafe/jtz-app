import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion });
}

// Crear sesión de pago para un pago pendiente
router.post('/checkout/:paymentId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const payment = await prisma.payment.findUnique({
    where: { id: Number(req.params.paymentId) },
    include: { runner: { select: { nombre: true, apellido: true, userId: true } } },
  });

  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  if (payment.estado === 'pagado') return res.status(400).json({ error: 'Este pago ya fue completado' });

  // El runner solo puede pagar sus propios pagos
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
          unit_amount: Math.round(payment.monto * 100), // centavos
        },
        quantity: 1,
      },
    ],
    metadata: { paymentId: payment.id.toString() },
    success_url: `${process.env.FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&payment_id=${payment.id}`,
    cancel_url: `${process.env.FRONTEND_URL}/pagos`,
  });

  return res.json({ url: session.url });
});

// Verificar pago completado (llamado desde la página de éxito)
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

// Webhook de Stripe (backup para confirmar pagos)
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
    const paymentId = session.metadata?.paymentId;
    if (paymentId) {
      await prisma.payment.update({
        where: { id: Number(paymentId) },
        data: { estado: 'pagado', fechaPago: new Date() },
      });
    }
  }

  return res.json({ received: true });
});

export default router;

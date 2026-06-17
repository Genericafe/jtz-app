import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/', async (_req: AuthRequest, res: Response) => {
  const payments = await prisma.payment.findMany({
    include: { runner: { select: { nombre: true, apellido: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(payments);
});

router.get('/stats', coachOnly, async (_req: AuthRequest, res: Response) => {
  const now = new Date();
  const [total, pagado, unpaid] = await Promise.all([
    prisma.payment.aggregate({ _sum: { monto: true }, where: { estado: 'pagado' } }),
    prisma.payment.count({ where: { estado: 'pagado' } }),
    // 'vencido' is computed: an unpaid payment past its due date.
    prisma.payment.findMany({ where: { estado: { not: 'pagado' } }, select: { fechaVencimiento: true } }),
  ]);
  const vencido = unpaid.filter(p => p.fechaVencimiento != null && p.fechaVencimiento < now).length;
  const pendiente = unpaid.length - vencido;
  return res.json({ totalRecaudado: total._sum.monto ?? 0, pendiente, pagado, vencido });
});

router.post('/', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    runnerId: z.number().int(),
    concepto: z.string(),
    monto: z.number().positive(),
    moneda: z.string().default('MXN'),
    estado: z.enum(['pendiente', 'pagado', 'vencido']).default('pendiente'),
    fechaVencimiento: z.string().optional(),
    fechaPago: z.string().optional(),
    duracion: z.number().int().positive().optional(),
    duracionUnidad: z.string().optional(),
    notas: z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  // 'vencido' is computed at read time, never stored. Only pendiente/pagado.
  const estado = parse.data.estado === 'pagado' ? 'pagado' : 'pendiente';
  const fechaPago = estado === 'pagado'
    ? (parse.data.fechaPago ? new Date(parse.data.fechaPago) : new Date())
    : null;

  const payment = await prisma.payment.create({
    data: {
      ...parse.data,
      estado,
      fechaVencimiento: parse.data.fechaVencimiento ? new Date(parse.data.fechaVencimiento) : undefined,
      fechaPago,
    },
  });
  return res.status(201).json(payment);
});

router.put('/:id/pay', coachOnly, async (req: AuthRequest, res: Response) => {
  const payment = await prisma.payment.update({
    where: { id: Number(req.params.id) },
    data: { estado: 'pagado', fechaPago: new Date() },
  });
  return res.json(payment);
});

router.put('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  const data = { ...req.body };
  if (data.fechaVencimiento) data.fechaVencimiento = new Date(data.fechaVencimiento);
  // Keep estado and fechaPago consistent. 'vencido' is computed, not stored:
  // anything that isn't 'pagado' is stored as 'pendiente' with no payment date.
  if (data.estado != null) {
    if (data.estado === 'pagado') {
      data.fechaPago = data.fechaPago ? new Date(data.fechaPago) : new Date();
    } else {
      data.estado = 'pendiente';
      data.fechaPago = null;
    }
  } else if (data.fechaPago) {
    data.fechaPago = new Date(data.fechaPago);
  }
  const payment = await prisma.payment.update({ where: { id: Number(req.params.id) }, data });
  return res.json(payment);
});

router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.payment.delete({ where: { id: Number(req.params.id) } });
    return res.json({ ok: true });
  } catch {
    return res.status(404).json({ error: 'Pago no encontrado' });
  }
});

// ── Payment reminder email (coach triggers) ───────────────────────────────────
router.post('/:id/remind', coachOnly, async (req: AuthRequest, res: Response) => {
  const payment = await prisma.payment.findUnique({
    where: { id: Number(req.params.id) },
    include: { runner: { include: { user: { select: { email: true } } } } },
  });
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  const email = payment.runner?.user?.email;
  if (!email) return res.status(400).json({ error: 'El corredor no tiene correo' });

  const { sendPaymentReminder } = await import('../services/email');
  await sendPaymentReminder({
    to: email,
    nombre: payment.runner.nombre,
    concepto: payment.concepto,
    monto: payment.monto,
    moneda: payment.moneda,
    fechaVencimiento: payment.fechaVencimiento ? payment.fechaVencimiento.toISOString() : null,
    vencido: payment.estado === 'vencido',
    coachUserId: req.userId,
  }).catch((e) => console.error('[payment reminder]', e));

  return res.json({ ok: true });
});

export default router;

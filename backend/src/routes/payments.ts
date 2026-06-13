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
  const [total, pendiente, pagado, vencido] = await Promise.all([
    prisma.payment.aggregate({ _sum: { monto: true }, where: { estado: 'pagado' } }),
    prisma.payment.count({ where: { estado: 'pendiente' } }),
    prisma.payment.count({ where: { estado: 'pagado' } }),
    prisma.payment.count({ where: { estado: 'vencido' } }),
  ]);
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

  const payment = await prisma.payment.create({
    data: {
      ...parse.data,
      fechaVencimiento: parse.data.fechaVencimiento ? new Date(parse.data.fechaVencimiento) : undefined,
      fechaPago: parse.data.fechaPago ? new Date(parse.data.fechaPago) : undefined,
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
  if (data.fechaPago) data.fechaPago = new Date(data.fechaPago);
  const payment = await prisma.payment.update({ where: { id: Number(req.params.id) }, data });
  return res.json(payment);
});

export default router;

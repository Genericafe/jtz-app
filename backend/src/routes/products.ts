import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/', async (_req: AuthRequest, res: Response) => {
  const products = await prisma.product.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
  return res.json(products);
});

router.post('/', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre: z.string(),
    descripcion: z.string().optional(),
    tipo: z.enum(['jersey', 'short', 'accesorio', 'calzado']),
    precio: z.number().positive(),
    costo: z.number().default(0),
    stock: z.number().int().default(0),
    talla: z.string().optional(),
    color: z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const product = await prisma.product.create({ data: parse.data });
  return res.status(201).json(product);
});

router.put('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  try {
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    return res.json(product);
  } catch (err) {
    console.error('[PUT /products/:id]', err);
    return res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

router.delete('/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  await prisma.product.update({
    where: { id: Number(req.params.id) },
    data: { activo: false },
  });
  return res.json({ ok: true });
});

// Runner: ver sus propios pedidos (antes de /orders/:id para evitar shadowing)
router.get('/orders/mine', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.json([]);
  const orders = await prisma.order.findMany({
    where: { runnerId: runner.id },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(orders);
});

// Runner: crear su propio pedido
router.post('/orders/self', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(403).json({ error: 'Solo corredores pueden hacer pedidos propios' });

  const schema = z.object({
    items: z.array(z.object({ productId: z.number().int(), cantidad: z.number().int().positive() })),
    notas: z.string().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const prods = await prisma.product.findMany({ where: { id: { in: parse.data.items.map(i => i.productId) }, activo: true } });
  const total = parse.data.items.reduce((s, item) => s + (prods.find(p => p.id === item.productId)?.precio ?? 0) * item.cantidad, 0);

  const order = await prisma.order.create({
    data: {
      runnerId: runner.id, total, estado: 'pendiente', notas: parse.data.notas,
      items: { create: parse.data.items.map(item => ({ productId: item.productId, cantidad: item.cantidad, precioUnit: prods.find(p => p.id === item.productId)?.precio ?? 0 })) },
    },
    include: { items: { include: { product: true } } },
  });
  return res.status(201).json(order);
});

router.get('/orders', async (_req: AuthRequest, res: Response) => {
  const orders = await prisma.order.findMany({
    include: {
      runner: { select: { nombre: true, apellido: true } },
      items: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(orders);
});

router.post('/orders', coachOnly, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    runnerId: z.number().int(),
    items: z.array(z.object({ productId: z.number().int(), cantidad: z.number().int().positive() })),
    notas: z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const products = await prisma.product.findMany({
    where: { id: { in: parse.data.items.map((i) => i.productId) } },
  });

  const total = parse.data.items.reduce((sum, item) => {
    const prod = products.find((p) => p.id === item.productId);
    return sum + (prod?.precio ?? 0) * item.cantidad;
  }, 0);

  const order = await prisma.order.create({
    data: {
      runnerId: parse.data.runnerId,
      total,
      notas: parse.data.notas,
      items: {
        create: parse.data.items.map((item) => ({
          productId: item.productId,
          cantidad: item.cantidad,
          precioUnit: products.find((p) => p.id === item.productId)?.precio ?? 0,
        })),
      },
    },
    include: { items: { include: { product: true } } },
  });
  return res.status(201).json(order);
});

router.put('/orders/:id', coachOnly, async (req: AuthRequest, res: Response) => {
  const order = await prisma.order.update({
    where: { id: Number(req.params.id) },
    data: { estado: req.body.estado },
  });
  return res.json(order);
});

export default router;

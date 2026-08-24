import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { sendPasswordReset } from '../services/email';

const router = Router();
const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/login', async (req: Request, res: Response) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const { email, password } = parse.data;
  const user = await prisma.user.findUnique({ where: { email }, include: { runner: true } });
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

  if (user.role === 'runner' && user.runner && !user.runner.activo) {
    return res.status(403).json({ error: 'Tu cuenta está deshabilitada. Contacta a tu coach.' });
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  return res.json({ token, user: { id: user.id, email: user.email, role: user.role, runner: user.runner } });
});

router.post('/register', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    nombre: z.string(),
    apellido: z.string(),
    role: z.enum(['coach', 'runner']).default('runner'),
    telefono: z.string().optional(),
    fechaNacimiento: z.string().optional(),
    genero: z.string().optional(),
    pais: z.string().optional(),
    estado: z.string().optional(),
    ciudad: z.string().optional(),
    tallaCamiseta: z.string().optional(),
    nivel: z.enum(['principiante', 'intermedio', 'avanzado', 'elite']).optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const { email, password, nombre, apellido, role, telefono, fechaNacimiento, genero, pais, estado, ciudad, tallaCamiseta, nivel } = parse.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'El correo ya está registrado' });

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      role,
      runner: {
        create: {
          nombre,
          apellido,
          telefono,
          fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : undefined,
          genero,
          pais: pais ?? 'México',
          estado: estado ?? 'México',
          ciudad: ciudad ?? 'México',
          tallaCamiseta,
          nivel: nivel ?? 'principiante',
        },
      },
    },
    include: { runner: true },
  });

  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  return res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, runner: user.runner } });
});

// ── Password reset ────────────────────────────────────────────────────────────
// Request a reset link. Always responds ok (don't reveal which emails exist).
router.post('/forgot-password', async (req: Request, res: Response) => {
  const parse = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Correo inválido' });
  const { email } = parse.data;

  const user = await prisma.user.findUnique({ where: { email }, include: { runner: true } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.user.update({ where: { id: user.id }, data: { resetToken: token, resetTokenExpiry: expiry } });

    // Send from any coach that has a verified email configured.
    const coachCfg = await (prisma as any).emailConfig.findFirst({ where: { verified: true }, select: { userId: true } });
    const base = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://jtz-app.vercel.app';
    const resetUrl = `${base}/reset-password?token=${token}`;
    try {
      await sendPasswordReset({ to: email, nombre: user.runner?.nombre ?? 'corredor', resetUrl, coachUserId: coachCfg?.userId });
    } catch (err) {
      console.error('[forgot-password] error al enviar correo:', err);
    }
  }
  return res.json({ ok: true });
});

// Apply a new password using the token from the email link.
router.post('/reset-password', async (req: Request, res: Response) => {
  const parse = z.object({ token: z.string().min(10), password: z.string().min(6) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const { token, password } = parse.data;

  const user = await prisma.user.findFirst({ where: { resetToken: token } });
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry.getTime() < Date.now()) {
    return res.status(400).json({ error: 'El enlace es inválido o ya venció. Solicita uno nuevo.' });
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, resetToken: null, resetTokenExpiry: null },
  });
  return res.json({ ok: true });
});

export default router;

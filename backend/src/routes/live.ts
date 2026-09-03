import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendToCoaches } from '../services/pushNotifications';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

async function myRunner(userId: number) {
  return prisma.runner.findUnique({ where: { userId }, select: { id: true, nombre: true, apellido: true } });
}
async function isCoach(userId: number) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'coach';
}

// ── Runner: start a live session ─────────────────────────────────────────────
router.post('/start', async (req: AuthRequest, res: Response) => {
  const runner = await myRunner(req.userId!);
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
  const tipo = typeof req.body?.tipo === 'string' ? req.body.tipo : 'correr';
  const publico = req.body?.publico === true;

  const now = new Date();
  await (prisma as any).liveSession.upsert({
    where: { runnerId: runner.id },
    update: { activo: true, publico, tipo, startedAt: now, endedAt: null, lastUpdate: now, distanciaKm: 0, trail: '[]', lastLat: null, lastLng: null },
    create: { runnerId: runner.id, tipo, publico, activo: true, trail: '[]' },
  });

  const nombre = `${runner.nombre} ${runner.apellido}`.trim();
  sendToCoaches('📍 Actividad en vivo', `${nombre} inició una actividad. Toca para seguirla en tiempo real.`,
    { type: 'live', runnerId: String(runner.id) }).catch(() => {});

  return res.json({ ok: true });
});

// ── Runner: position ping ────────────────────────────────────────────────────
router.post('/ping', async (req: AuthRequest, res: Response) => {
  const runner = await myRunner(req.userId!);
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });

  const parse = z.object({
    lat: z.number(), lng: z.number(),
    distanciaKm: z.number().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });
  const { lat, lng, distanciaKm } = parse.data;

  const session = await (prisma as any).liveSession.findUnique({ where: { runnerId: runner.id } });
  if (!session || !session.activo) return res.json({ ok: false, inactive: true });

  let trail: number[][] = [];
  try { trail = JSON.parse(session.trail ?? '[]'); } catch { trail = []; }
  trail.push([lng, lat]);
  if (trail.length > 800) trail = trail.slice(-800);

  await (prisma as any).liveSession.update({
    where: { runnerId: runner.id },
    data: { lastLat: lat, lastLng: lng, lastUpdate: new Date(), distanciaKm: distanciaKm ?? session.distanciaKm, trail: JSON.stringify(trail) },
  });
  return res.json({ ok: true });
});

// ── Runner: stop ─────────────────────────────────────────────────────────────
router.post('/stop', async (req: AuthRequest, res: Response) => {
  const runner = await myRunner(req.userId!);
  if (!runner) return res.json({ ok: true });
  await (prisma as any).liveSession.updateMany({
    where: { runnerId: runner.id }, data: { activo: false, endedAt: new Date() },
  });
  return res.json({ ok: true });
});

// ── Coach: list active sessions ──────────────────────────────────────────────
router.get('/active', async (req: AuthRequest, res: Response) => {
  if (!(await isCoach(req.userId!))) return res.status(403).json({ error: 'Solo el entrenador' });
  // Consider a session stale if no ping for 90s
  const cutoff = new Date(Date.now() - 90_000);
  const sessions = await (prisma as any).liveSession.findMany({
    where: { activo: true, lastUpdate: { gte: cutoff } },
    include: { runner: { select: { id: true, nombre: true, apellido: true } } },
    orderBy: { lastUpdate: 'desc' },
  });
  return res.json(sessions.map((s: any) => ({
    runnerId: s.runnerId,
    nombre: `${s.runner.nombre} ${s.runner.apellido}`.trim(),
    tipo: s.tipo, startedAt: s.startedAt, lastUpdate: s.lastUpdate,
    lat: s.lastLat, lng: s.lastLng, distanciaKm: s.distanciaKm,
  })));
});

// ── Coach: one session detail (position + trail) ─────────────────────────────
router.get('/session/:runnerId', async (req: AuthRequest, res: Response) => {
  if (!(await isCoach(req.userId!))) return res.status(403).json({ error: 'Solo el entrenador' });
  const s = await (prisma as any).liveSession.findUnique({
    where: { runnerId: Number(req.params.runnerId) },
    include: { runner: { select: { nombre: true, apellido: true } } },
  });
  if (!s) return res.status(404).json({ error: 'No hay sesión' });
  let trail: number[][] = [];
  try { trail = JSON.parse(s.trail ?? '[]'); } catch { trail = []; }
  return res.json({
    runnerId: s.runnerId, nombre: `${s.runner.nombre} ${s.runner.apellido}`.trim(),
    activo: s.activo, tipo: s.tipo, startedAt: s.startedAt, lastUpdate: s.lastUpdate,
    lat: s.lastLat, lng: s.lastLng, distanciaKm: s.distanciaKm, trail,
    stale: Date.now() - new Date(s.lastUpdate).getTime() > 90_000,
  });
});

// ── Coach: send a voice note to a runner ─────────────────────────────────────
router.post('/audio/:runnerId', async (req: AuthRequest, res: Response) => {
  if (!(await isCoach(req.userId!))) return res.status(403).json({ error: 'Solo el entrenador' });
  const runnerId = Number(req.params.runnerId);
  const data = req.body?.data;
  if (typeof data !== 'string' || !data.startsWith('data:audio') || data.length > 900_000) {
    return res.status(400).json({ error: 'Audio inválido o muy largo (máx ~10s)' });
  }
  const session = await (prisma as any).liveSession.findUnique({ where: { runnerId }, select: { id: true } });
  await (prisma as any).liveAudio.create({
    data: { runnerId, sessionId: session?.id ?? null, data, fromCoach: req.userId! },
  });
  return res.json({ ok: true });
});

// ── Runner: fetch new (unplayed) voice notes, then mark played ────────────────
router.get('/audio', async (req: AuthRequest, res: Response) => {
  const runner = await myRunner(req.userId!);
  if (!runner) return res.json([]);
  const audios = await (prisma as any).liveAudio.findMany({
    where: { runnerId: runner.id, played: false },
    orderBy: { createdAt: 'asc' },
  });
  if (audios.length > 0) {
    await (prisma as any).liveAudio.updateMany({
      where: { id: { in: audios.map((a: any) => a.id) } }, data: { played: true },
    });
  }
  return res.json(audios.map((a: any) => ({ id: a.id, data: a.data, createdAt: a.createdAt })));
});

export default router;

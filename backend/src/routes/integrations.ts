import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import { sendToUser } from '../services/pushNotifications';
import {
  getValidStravaToken,
  fetchRecentStravaActivities,
  importStravaActivityById,
  resolveStravaActivityId,
} from '../services/strava';

const router = Router();
const prisma = new PrismaClient();

// Public route — Strava redirects here after OAuth (no JWT available)
router.get('/strava/callback', async (req: AuthRequest, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendUrl = (process.env.FRONTEND_URL ?? 'https://jtz-app.vercel.app').split(',')[0].trim();

  if (error || !code) {
    return res.redirect(`${frontendUrl}/actividades?strava=error`);
  }

  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/actividades?strava=error`);
  }

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        grant_type:    'authorization_code',
      }),
    });
    if (!tokenRes.ok) return res.redirect(`${frontendUrl}/actividades?strava=error`);

    const data: any = await tokenRes.json();
    const userId = Number(state);
    if (!userId) return res.redirect(`${frontendUrl}/actividades?strava=error`);

    await (prisma as any).runner.update({
      where: { userId },
      data: {
        stravaAthleteId:    data.athlete?.id,
        stravaAccessToken:  data.access_token,
        stravaRefreshToken: data.refresh_token,
        stravaTokenExpiry:  new Date(data.expires_at * 1000),
      },
    });

    return res.redirect(`${frontendUrl}/actividades?strava=connected`);
  } catch {
    return res.redirect(`${frontendUrl}/actividades?strava=error`);
  }
});

router.use(authMiddleware);

// GET /integrations/activities
router.get('/activities', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
  try {
    const logs = await (prisma as any).activityLog.findMany({
      where: { runnerId: runner.id },
      orderBy: { fecha: 'desc' },
      take: 50,
      select: {
        id: true, diaId: true, fuente: true, nombre: true, tipo: true, fecha: true,
        distanciaKm: true, duracionMin: true, tiempoElapsadoMin: true, ritmoMinKm: true,
        fcPromedio: true, fcMax: true,
        cadenciaPromedio: true, cadenciaMax: true,
        elevacionM: true, elevacionPerdidaM: true,
        caloriasKcal: true,
        potenciaW: true, potenciaMax: true, potenciaPonderada: true, potenciaPromedio30s: true,
        gpxNombre: true, notas: true,
        confirmadoPorCoach: true, confirmedAt: true,
        createdAt: true,
      },
    });
    return res.json(logs);
  } catch {
    return res.json([]);
  }
});

// GET /integrations/activities/day/:diaId — actividades por día de entrenamiento
// Coach: todas; runner: solo la propia
router.get('/activities/day/:diaId', async (req: AuthRequest, res: Response) => {
  const diaId = Number(req.params.diaId);
  if (isNaN(diaId)) return res.status(400).json({ error: 'diaId inválido' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  try {
    if (user.role === 'coach') {
      const logs = await (prisma as any).activityLog.findMany({
        where: { diaId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, diaId: true, fuente: true, nombre: true, tipo: true, fecha: true,
          distanciaKm: true, duracionMin: true, tiempoElapsadoMin: true, ritmoMinKm: true,
          fcPromedio: true, fcMax: true,
          cadenciaPromedio: true, cadenciaMax: true,
          elevacionM: true, elevacionPerdidaM: true,
          caloriasKcal: true,
          potenciaW: true, potenciaMax: true, potenciaPonderada: true, potenciaPromedio30s: true,
          gpxNombre: true, notas: true,
          confirmadoPorCoach: true, confirmedAt: true,
          createdAt: true,
          runner: { select: { id: true, nombre: true, apellido: true } },
        },
      });
      return res.json(logs);
    } else {
      const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
      if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
      const logs = await (prisma as any).activityLog.findMany({
        where: { diaId, runnerId: runner.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true, diaId: true, fuente: true, nombre: true, tipo: true, fecha: true,
          distanciaKm: true, duracionMin: true, tiempoElapsadoMin: true, ritmoMinKm: true,
          fcPromedio: true, fcMax: true,
          cadenciaPromedio: true, cadenciaMax: true,
          elevacionM: true, elevacionPerdidaM: true,
          caloriasKcal: true,
          potenciaW: true, potenciaMax: true, potenciaPonderada: true, potenciaPromedio30s: true,
          gpxNombre: true, notas: true,
          confirmadoPorCoach: true, confirmedAt: true,
          createdAt: true,
        },
      });
      return res.json(logs);
    }
  } catch {
    return res.json([]);
  }
});

// GET /integrations/activities/:id — actividad completa con gpxContent
router.get('/activities/:id', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  try {
    let log;
    if (user.role === 'coach') {
      log = await (prisma as any).activityLog.findUnique({ where: { id } });
    } else {
      const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
      if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
      log = await (prisma as any).activityLog.findFirst({ where: { id, runnerId: runner.id } });
    }
    if (!log) return res.status(404).json({ error: 'Actividad no encontrada' });
    return res.json(log);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error' });
  }
});

// POST /integrations/activities
router.post('/activities', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    nombre:              z.string().optional(),
    tipo:                z.string().default('correr'),
    fecha:               z.string().optional(),
    diaId:               z.number().int().optional(),
    distanciaKm:         z.number().optional(),
    duracionMin:         z.number().optional().transform(v => v != null ? Math.round(v) : v),
    tiempoElapsadoMin:   z.number().optional(),
    fcPromedio:          z.number().int().optional(),
    fcMax:               z.number().int().optional(),
    cadenciaPromedio:    z.number().int().optional(),
    cadenciaMax:         z.number().int().optional(),
    elevacionM:          z.number().optional(),
    elevacionPerdidaM:   z.number().optional(),
    caloriasKcal:        z.number().int().optional(),
    potenciaW:           z.number().int().optional(),
    potenciaMax:         z.number().int().optional(),
    potenciaPonderada:   z.number().int().optional(),
    potenciaPromedio30s: z.number().int().optional(),
    gpxContent:          z.string().optional(),
    gpxNombre:           z.string().optional(),
    notas:               z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });

  const d = parse.data;
  const ritmoMinKm = d.distanciaKm && d.duracionMin
    ? d.duracionMin / d.distanciaKm : undefined;

  try {
    const log = await (prisma as any).activityLog.create({
      data: {
        runnerId: runner.id,
        fuente:   d.gpxContent ? 'gpx' : 'manual',
        ...d,
        ritmoMinKm,
        fecha: d.fecha ? new Date(d.fecha) : new Date(),
      },
    });
    return res.status(201).json(log);
  } catch (err: any) {
    console.error('[activity log create]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Error al guardar la actividad' });
  }
});

// PATCH /integrations/activities/:id/confirm — el coach confirma una actividad
router.patch('/activities/:id/confirm', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador puede confirmar actividades' });

  try {
    const log = await (prisma as any).activityLog.update({
      where: { id: Number(req.params.id) },
      data: { confirmadoPorCoach: true, confirmedAt: new Date() },
      include: { runner: { select: { userId: true, nombre: true } } },
    });

    // Notifica al corredor
    sendToUser(
      log.runner.userId,
      '¡Actividad confirmada! ✅',
      `Tu entrenamiento "${log.nombre ?? 'actividad'}" fue confirmado por el coach`,
      { type: 'activity', id: String(log.id) },
    ).catch(() => {});

    return res.json(log);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error al confirmar' });
  }
});

// PATCH /integrations/activities/:id/unconfirm — el coach quita la confirmación
router.patch('/activities/:id/unconfirm', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador puede modificar confirmaciones' });

  try {
    const log = await (prisma as any).activityLog.update({
      where: { id: Number(req.params.id) },
      data: { confirmadoPorCoach: false, confirmedAt: null },
    });
    return res.json(log);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error al quitar confirmación' });
  }
});

// DELETE /integrations/activities/:id
router.delete('/activities/:id', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'No encontrado' });
  try {
    await (prisma as any).activityLog.deleteMany({
      where: { id: Number(req.params.id), runnerId: runner.id },
    });
  } catch { /* ignore if table doesn't exist */ }
  return res.json({ ok: true });
});

// ── Strava OAuth ──────────────────────────────────────────────────────────────

// GET /integrations/strava/status
router.get('/strava/status', async (req: AuthRequest, res: Response) => {
  const runner = await (prisma as any).runner.findUnique({ where: { userId: req.userId! } });
  if (!runner || !runner.stravaAthleteId) return res.json({ connected: false });
  return res.json({
    connected: true,
    athleteId: runner.stravaAthleteId,
  });
});

// GET /integrations/strava/connect — returns the Strava OAuth URL (frontend does the redirect)
router.get('/strava/connect', (req: AuthRequest, res: Response) => {
  const clientId    = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(503).json({ error: 'Strava no configurado en este servidor. Contacta al administrador.' });
  }
  const state = req.userId!.toString();
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=auto&scope=activity:read_all&state=${state}`;
  return res.json({ url });
});

// POST /integrations/strava/disconnect
router.post('/strava/disconnect', async (req: AuthRequest, res: Response) => {
  await (prisma as any).runner.update({
    where: { userId: req.userId! },
    data: {
      stravaAthleteId:   null,
      stravaAccessToken:  null,
      stravaRefreshToken: null,
      stravaTokenExpiry:  null,
    },
  });
  return res.json({ ok: true });
});

// POST /integrations/strava/sync — import last 30 activities
router.post('/strava/sync', async (req: AuthRequest, res: Response) => {
  const runner = await (prisma as any).runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });

  const token = await getValidStravaToken(runner, prisma);
  if (!token) return res.status(401).json({ error: 'Conecta tu cuenta de Strava primero' });

  try {
    const activities = await fetchRecentStravaActivities(token);
    let imported = 0;
    let skipped  = 0;

    for (const a of activities) {
      // Skip if already imported
      const existing = await (prisma as any).activityLog.findFirst({
        where: { stravaActivityId: a.id },
      });
      if (existing) { skipped++; continue; }

      await importStravaActivityById(token, a.id, runner.id, prisma);
      imported++;
    }

    return res.json({ ok: true, imported, skipped });
  } catch (err: any) {
    console.error('[strava sync]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Error al sincronizar' });
  }
});

// POST /integrations/strava/import-url — import specific activity from Strava URL/link
router.post('/strava/import-url', async (req: AuthRequest, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL requerida' });
  }

  const runner = await (prisma as any).runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });

  const token = await getValidStravaToken(runner, prisma);
  if (!token) {
    return res.status(401).json({ error: 'Conecta tu cuenta de Strava primero' });
  }

  const activityId = await resolveStravaActivityId(url);
  if (!activityId) {
    return res.status(400).json({ error: 'No se pudo identificar la actividad desde el enlace' });
  }

  // Skip if already imported
  const existing = await (prisma as any).activityLog.findFirst({
    where: { stravaActivityId: activityId },
  });
  if (existing) return res.json({ ok: true, log: existing, alreadyExists: true });

  try {
    const log = await importStravaActivityById(token, activityId, runner.id, prisma);
    return res.status(201).json({ ok: true, log });
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (msg.includes('403') || msg.includes('401')) {
      return res.status(403).json({ error: 'Esta actividad no pertenece a tu cuenta de Strava' });
    }
    return res.status(500).json({ error: msg || 'Error al importar' });
  }
});

export default router;

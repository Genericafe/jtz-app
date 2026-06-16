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

// ── Strava Webhook (public) ───────────────────────────────────────────────────
// Strava calls these without a JWT, so they must sit before authMiddleware.

// `||` (not `??`) so an env var left blank in Railway still falls back to the
// default — Strava rejects an empty verify_token.
const STRAVA_WEBHOOK_VERIFY_TOKEN =
  process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'jtz-strava-webhook-2026';

// GET — subscription validation handshake (Strava sends hub.challenge once)
router.get('/strava/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return res.json({ 'hub.challenge': challenge });
  }
  return res.sendStatus(403);
});

// POST — event notifications (new activities, updates, deauthorizations)
router.post('/strava/webhook', async (req, res) => {
  // Strava requires a 200 within 2 s, so ack first and process asynchronously.
  res.sendStatus(200);

  const event = req.body ?? {};
  const athleteId = event.owner_id;
  const actId     = event.object_id;

  try {
    // Athlete revoked access → disconnect them locally
    if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
      await (prisma as any).runner.updateMany({
        where: { stravaAthleteId: athleteId },
        data:  { stravaAthleteId: null, stravaAccessToken: null, stravaRefreshToken: null, stravaTokenExpiry: null },
      });
      return;
    }

    // Only auto-import brand-new activities
    if (event.object_type !== 'activity' || event.aspect_type !== 'create') return;

    const runner = await (prisma as any).runner.findUnique({ where: { stravaAthleteId: athleteId } });
    if (!runner) return;

    // Skip if already imported (manual sync may have beaten the webhook)
    const existing = await (prisma as any).activityLog.findFirst({ where: { stravaActivityId: actId } });
    if (existing) return;

    const token = await getValidStravaToken(runner, prisma);
    if (!token) return;

    const log = await importStravaActivityById(token, actId, runner.id, prisma);

    if (runner.userId) {
      await sendToUser(
        runner.userId,
        '✅ Actividad sincronizada',
        `${log.nombre ?? 'Tu actividad'} se importó automáticamente desde Strava`,
        { type: 'activity', activityId: String(log.id) },
      );
    }
  } catch (err: any) {
    console.error('[strava webhook]', err?.message ?? err);
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

// ── Strava webhook subscription management (coach-only, one-time setup) ────────

function stravaCallbackUrl(): string {
  const base = (process.env.API_PUBLIC_URL ?? process.env.STRAVA_REDIRECT_URI ?? '')
    .replace(/\/integrations\/strava\/callback.*$/, '')
    .replace(/\/$/, '');
  return `${base}/integrations/strava/webhook`;
}

// GET — view the current subscription (or null)
router.get('/strava/webhook/status', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador' });

  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'Strava no configurado' });

  try {
    const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
    const r = await fetch(`https://www.strava.com/api/v3/push_subscriptions?${params}`);
    const data: any = await r.json();
    const sub = Array.isArray(data) ? data[0] : null;
    return res.json({ active: !!sub, subscription: sub ?? null, callbackUrl: stravaCallbackUrl() });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error' });
  }
});

// POST — register the webhook subscription with Strava
router.post('/strava/webhook/subscribe', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador' });

  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'Strava no configurado' });

  try {
    const body = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      callback_url:  stravaCallbackUrl(),
      verify_token:  STRAVA_WEBHOOK_VERIFY_TOKEN,
    });
    const r = await fetch('https://www.strava.com/api/v3/push_subscriptions', { method: 'POST', body });
    const data: any = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: data?.errors?.[0]?.resource ? JSON.stringify(data.errors) : (data?.message ?? 'Error al suscribir'), detail: data });
    }
    return res.status(201).json({ ok: true, subscription: data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error' });
  }
});

// DELETE — remove the webhook subscription
router.delete('/strava/webhook/subscribe/:id', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Solo el entrenador' });

  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'Strava no configurado' });

  try {
    const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
    const r = await fetch(`https://www.strava.com/api/v3/push_subscriptions/${req.params.id}?${params}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 204) {
      const data: any = await r.json().catch(() => ({}));
      return res.status(400).json({ error: data?.message ?? 'Error al eliminar' });
    }
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error' });
  }
});

export default router;

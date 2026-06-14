import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

const STRAVA_CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const BACKEND_URL          = process.env.BACKEND_URL ?? 'http://localhost:3001';
const FRONTEND_URL         = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const REDIRECT_URI         = `${BACKEND_URL}/api/integrations/strava/callback`;

// ── Strava OAuth ──────────────────────────────────────────────────────────────

// GET /integrations/strava/status — check connection + credentials
router.get('/strava/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  const configured = !!(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET);
  const runner = await prisma.runner.findUnique({
    where: { userId: req.userId! },
    select: { stravaAthleteId: true },
  });
  return res.json({ configured, connected: !!runner?.stravaAthleteId });
});

// GET /integrations/strava/connect — generate OAuth URL (auth required)
router.get('/strava/connect', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Strava no está configurado en el servidor. Agrega STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET.' });
  }
  const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&approval_prompt=auto&scope=activity:read_all&state=${req.userId}`;
  return res.json({ url });
});

// GET /integrations/strava/callback — Strava redirects here (no auth middleware, uses state param)
router.get('/strava/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/perfil?strava_error=acceso_denegado`);
  }

  const userId = Number(state);
  if (!userId || isNaN(userId)) {
    return res.redirect(`${FRONTEND_URL}/perfil?strava_error=estado_invalido`);
  }

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const data = await tokenRes.json() as any;
    if (!data.access_token) throw new Error('No access_token');

    await prisma.runner.update({
      where: { userId },
      data: {
        stravaAthleteId: String(data.athlete?.id ?? ''),
        stravaToken:     data.access_token,
        stravaRefresh:   data.refresh_token,
        stravaExpiry:    new Date(data.expires_at * 1000),
      },
    });

    return res.redirect(`${FRONTEND_URL}/perfil?strava_ok=1`);
  } catch (err) {
    console.error('[Strava callback]', err);
    return res.redirect(`${FRONTEND_URL}/perfil?strava_error=fallo_token`);
  }
});

// POST /integrations/strava/disconnect
router.post('/strava/disconnect', authMiddleware, async (req: AuthRequest, res: Response) => {
  await prisma.runner.update({
    where: { userId: req.userId! },
    data: { stravaAthleteId: null, stravaToken: null, stravaRefresh: null, stravaExpiry: null },
  });
  return res.json({ ok: true });
});

// POST /integrations/strava/sync — import recent activities from Strava
router.post('/strava/sync', authMiddleware, async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner?.stravaToken) return res.status(400).json({ error: 'Strava no conectado' });

  // Refresh token if expired
  let accessToken = runner.stravaToken;
  if (runner.stravaExpiry && runner.stravaExpiry < new Date()) {
    try {
      const refreshRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          refresh_token: runner.stravaRefresh,
          grant_type: 'refresh_token',
        }),
      });
      const refreshData = await refreshRes.json() as any;
      accessToken = refreshData.access_token;
      await prisma.runner.update({
        where: { id: runner.id },
        data: {
          stravaToken:  refreshData.access_token,
          stravaRefresh: refreshData.refresh_token,
          stravaExpiry:  new Date(refreshData.expires_at * 1000),
        },
      });
    } catch {
      return res.status(401).json({ error: 'Token expirado, reconecta Strava' });
    }
  }

  // Fetch last 30 activities
  const activitiesRes = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=30',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const activities = await activitiesRes.json() as any[];
  if (!Array.isArray(activities)) return res.status(400).json({ error: 'Error al obtener actividades de Strava' });

  const tipoMap: Record<string, string> = {
    Run: 'correr', TrailRun: 'trail', Ride: 'ciclismo',
    Swim: 'natacion', Walk: 'correr', Hike: 'trail',
  };

  let imported = 0;
  for (const a of activities) {
    try {
      await (prisma as any).activityLog.upsert({
        where: { stravaId: String(a.id) },
        update: {},
        create: {
          runnerId:     runner.id,
          fuente:       'strava',
          stravaId:     String(a.id),
          nombre:       a.name,
          tipo:         tipoMap[a.type] ?? 'otro',
          fecha:        new Date(a.start_date),
          distanciaKm:  a.distance ? a.distance / 1000 : null,
          duracionMin:  a.moving_time ? a.moving_time / 60 : null,
          ritmoMinKm:   a.average_speed && a.average_speed > 0
                          ? 1000 / (a.average_speed * 60) : null,
          fcPromedio:   a.average_heartrate ? Math.round(a.average_heartrate) : null,
          fcMax:        a.max_heartrate ? Math.round(a.max_heartrate) : null,
          elevacionM:   a.total_elevation_gain ?? null,
          caloriasKcal: a.calories ? Math.round(a.calories) : null,
          potenciaW:    a.average_watts ? Math.round(a.average_watts) : null,
        },
      });
      imported++;
    } catch { /* skip duplicates */ }
  }

  return res.json({ ok: true, imported });
});

// ── Activity logs (manual entry) ──────────────────────────────────────────────

router.use(authMiddleware);

router.get('/activities', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });
  const logs = await (prisma as any).activityLog.findMany({
    where: { runnerId: runner.id },
    orderBy: { fecha: 'desc' },
    take: 50,
  });
  return res.json(logs);
});

router.post('/activities', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    diaId:        z.number().int().optional(),
    nombre:       z.string().optional(),
    tipo:         z.string().default('correr'),
    fecha:        z.string().optional(),
    distanciaKm:  z.number().optional(),
    duracionMin:  z.number().optional(),
    fcPromedio:   z.number().int().optional(),
    fcMax:        z.number().int().optional(),
    elevacionM:   z.number().optional(),
    caloriasKcal: z.number().int().optional(),
    potenciaW:    z.number().int().optional(),
    gpxContent:   z.string().optional(),
    gpxNombre:    z.string().optional(),
    notas:        z.string().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos' });

  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'Perfil no encontrado' });

  const d = parse.data;
  const ritmoMinKm = d.distanciaKm && d.duracionMin
    ? d.duracionMin / d.distanciaKm : undefined;

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
});

router.delete('/activities/:id', async (req: AuthRequest, res: Response) => {
  const runner = await prisma.runner.findUnique({ where: { userId: req.userId! } });
  if (!runner) return res.status(404).json({ error: 'No encontrado' });
  await (prisma as any).activityLog.deleteMany({
    where: { id: Number(req.params.id), runnerId: runner.id },
  });
  return res.json({ ok: true });
});

export default router;

import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';

interface StoredEmailConfig {
  provider: string; verified: boolean; fromEmail: string; fromName: string;
  smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string;
  oauthAccessToken: string | null; oauthRefreshToken: string | null;
}
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { testSmtpConfig } from '../services/email';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// ── Google OAuth2 client ──────────────────────────────────────────────────────
function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? `${process.env.BACKEND_URL ?? 'http://localhost:3001'}/api/settings/email/google/callback`,
  );
}

// GET /settings/email/google/auth — returns the Google consent URL (coach only)
router.get('/email/google/auth', authMiddleware, coachOnly, (req: AuthRequest, res: Response) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google OAuth no está configurado en el servidor.' });
  }

  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',  // always get refresh_token
    scope: [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state: String(req.userId),
  });

  return res.json({ url });
});

// GET /settings/email/google/callback — Google redirects here after consent
router.get('/email/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  // Take the first comma-separated value in case FRONTEND_URL has multiple origins
  const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim();

  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}/configuracion?email_error=acceso_denegado`);
  }

  const userId = Number(state);
  if (!userId || isNaN(userId)) {
    return res.redirect(`${frontendUrl}/configuracion?email_error=estado_invalido`);
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return res.redirect(`${frontendUrl}/configuracion?email_error=sin_refresh_token`);
    }

    // Decode id_token to get the user's Gmail address
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });
    const payload = ticket.getPayload();
    const gmailAddress = payload?.email ?? '';
    const fromName    = payload?.name ?? 'JTZ Running Club';

    await prisma.emailConfig.upsert({
      where:  { userId },
      update: {
        provider:          'google_oauth',
        fromEmail:         gmailAddress,
        fromName,
        smtpHost:          'smtp.gmail.com',
        smtpPort:          587,
        smtpUser:          gmailAddress,
        smtpPass:          '',
        oauthAccessToken:  tokens.access_token  ?? null,
        oauthRefreshToken: tokens.refresh_token ?? null,
        verified:          true,
      },
      create: {
        userId,
        provider:          'google_oauth',
        fromEmail:         gmailAddress,
        fromName,
        smtpHost:          'smtp.gmail.com',
        smtpPort:          587,
        smtpUser:          gmailAddress,
        smtpPass:          '',
        oauthAccessToken:  tokens.access_token  ?? null,
        oauthRefreshToken: tokens.refresh_token ?? null,
        verified:          true,
      },
    });

    return res.redirect(`${frontendUrl}/configuracion?email_ok=1`);
  } catch (err) {
    console.error('[Google OAuth callback]', err);
    return res.redirect(`${frontendUrl}/configuracion?email_error=fallo_intercambio`);
  }
});

// ── SMTP routes (kept for Outlook / custom SMTP) ──────────────────────────────

router.use(authMiddleware);

router.get('/email', async (req: AuthRequest, res: Response) => {
  const cfg = await prisma.emailConfig.findUnique({ where: { userId: req.userId! } });
  if (!cfg) return res.json(null);
  return res.json({
    ...cfg,
    smtpPass:          cfg.smtpPass ? '••••••••' : '',
    oauthAccessToken:  undefined,
    oauthRefreshToken: undefined,
  });
});

const emailConfigSchema = z.object({
  provider:  z.enum(['gmail', 'outlook', 'smtp']).default('gmail'),
  fromName:  z.string().min(1),
  fromEmail: z.string().email(),
  smtpHost:  z.string().min(1),
  smtpPort:  z.number().int().default(587),
  smtpUser:  z.string().min(1),
  smtpPass:  z.string().optional(),
});

router.post('/email', async (req: AuthRequest, res: Response) => {
  const parse = emailConfigSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Datos inválidos', details: parse.error.errors });

  const data = parse.data;

  let resolvedPass = data.smtpPass;
  if (!resolvedPass) {
    const existing = await prisma.emailConfig.findUnique({ where: { userId: req.userId! } });
    resolvedPass = existing?.smtpPass ?? undefined;
  }
  if (!resolvedPass) {
    return res.status(400).json({ error: 'Contraseña requerida para una nueva configuración' });
  }

  const smtpUser = data.provider !== 'smtp' ? data.fromEmail : data.smtpUser;

  try {
    await testSmtpConfig({
      host: data.smtpHost,
      port: data.smtpPort,
      secure: data.smtpPort === 465,
      auth: { user: smtpUser, pass: resolvedPass },
      from: `${data.fromName} <${data.fromEmail}>`,
      to: data.fromEmail,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de conexión';
    return res.status(400).json({ error: 'No se pudo conectar al servidor de correo', detail: msg });
  }

  const cfg = await prisma.emailConfig.upsert({
    where:  { userId: req.userId! },
    update: { ...data, smtpUser, smtpPass: resolvedPass, oauthAccessToken: null, oauthRefreshToken: null, verified: true },
    create: { userId: req.userId!, ...data, smtpUser, smtpPass: resolvedPass, verified: true },
  });

  return res.json({ ...cfg, smtpPass: '••••••••', oauthAccessToken: undefined, oauthRefreshToken: undefined });
});

router.delete('/email', async (req: AuthRequest, res: Response) => {
  await prisma.emailConfig.deleteMany({ where: { userId: req.userId! } });
  return res.json({ ok: true });
});

router.post('/email/test', async (req: AuthRequest, res: Response) => {
  const cfg = await prisma.emailConfig.findUnique({ where: { userId: req.userId! } }) as StoredEmailConfig | null;
  if (!cfg) return res.status(404).json({ error: 'No hay configuración guardada' });

  try {
    if (cfg.provider === 'google_oauth' && cfg.oauthRefreshToken) {
      // For OAuth2 just send a test email using the service
      const { testOAuthEmail } = await import('../services/email');
      await testOAuthEmail(cfg.fromEmail, cfg.fromName, cfg.oauthAccessToken, cfg.oauthRefreshToken);
    } else {
      await testSmtpConfig({
        host: cfg.smtpHost,
        port: cfg.smtpPort,
        secure: cfg.smtpPort === 465,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to: cfg.fromEmail,
      });
    }
    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return res.status(400).json({ error: msg });
  }
});

export default router;

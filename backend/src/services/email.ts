import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Local type that includes the OAuth2 fields added in the latest migration
interface StoredEmailConfig {
  provider: string;
  verified: boolean;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
}

interface TransportConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

function buildTransporter(host: string, port: number, user: string, pass: string): nodemailer.Transporter {
  const cleanPass = pass.replace(/\s/g, '');

  if (host === 'smtp.gmail.com') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: cleanPass },
    });
  }

  if (host === 'smtp.office365.com') {
    return nodemailer.createTransport({
      host, port: 587, secure: false, requireTLS: true,
      auth: { user, pass: cleanPass },
      tls: { ciphers: 'SSLv3', minVersion: 'TLSv1.2' },
    });
  }

  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass: cleanPass },
    tls: { minVersion: 'TLSv1.2' },
  });
}

async function getFreshAccessToken(refreshToken: string): Promise<string> {
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('No se pudo obtener un access token de Google');
  return token;
}

function buildOAuthTransporter(user: string, accessToken: string, refreshToken: string): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      type: 'OAuth2',
      user,
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken,
      accessToken,
    },
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });
}

// Returns the email transporter for a user (OAuth2 > SMTP > env fallback)
async function getTransportForUser(userId?: number): Promise<{ transporter: nodemailer.Transporter; from: string }> {
  if (userId) {
    const cfg = await prisma.emailConfig.findUnique({ where: { userId } }) as StoredEmailConfig | null;
    if (cfg?.verified) {
      if (cfg.provider === 'google_oauth' && cfg.oauthRefreshToken) {
        const freshToken = await getFreshAccessToken(cfg.oauthRefreshToken);
        return {
          transporter: buildOAuthTransporter(cfg.fromEmail, freshToken, cfg.oauthRefreshToken),
          from: `${cfg.fromName} <${cfg.fromEmail}>`,
        };
      }
      return {
        transporter: buildTransporter(cfg.smtpHost, cfg.smtpPort, cfg.smtpUser, cfg.smtpPass),
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
      };
    }
  }

  return {
    transporter: buildTransporter(
      process.env.SMTP_HOST ?? 'smtp.gmail.com',
      Number(process.env.SMTP_PORT) || 587,
      process.env.SMTP_USER!,
      process.env.SMTP_PASS!,
    ),
    from: process.env.SMTP_FROM ?? 'JTZ Running Club <noreply@jtz.mx>',
  };
}

// Test an OAuth2 Gmail config (called from /settings/email/test)
export async function testOAuthEmail(
  userEmail: string,
  fromName: string,
  _accessToken: string | null,
  refreshToken: string,
): Promise<void> {
  const freshToken = await getFreshAccessToken(refreshToken);
  const transporter = buildOAuthTransporter(userEmail, freshToken, refreshToken);

  const send = transporter.sendMail({
    from: `${fromName} <${userEmail}>`,
    to: userEmail,
    subject: '✅ JTZ — Correo de prueba (Google OAuth)',
    html: baseTemplate(`
      <div class="header"><h1>✅ Conexión exitosa</h1><p>JTZ Running Club</p></div>
      <div class="body">
        <p>¡Tu cuenta de Gmail está conectada con OAuth2!</p>
        <p>Los correos del club se enviarán automáticamente desde <strong style="color:white">${userEmail}</strong>.</p>
        <p style="color:#94a3b8;font-size:13px">— Coach · JTZ Running Club</p>
      </div>
    `),
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con Gmail. Verifica que el correo es válido e intenta de nuevo.')), 18000)
  );

  await Promise.race([send, timeout]);
}

// Test a given SMTP config without saving it
export async function testSmtpConfig(config: TransportConfig & { from: string; to: string }): Promise<void> {
  const transporter = buildTransporter(config.host, config.port, config.auth.user, config.auth.pass);
  await transporter.verify();
  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: '✅ JTZ — Correo de prueba',
    html: baseTemplate(`
      <div class="header"><h1>✅ Conexión exitosa</h1><p>JTZ Running Club</p></div>
      <div class="body">
        <p>¡Tu cuenta de correo está conectada correctamente con JTZ!</p>
        <p>A partir de ahora los correos del club se enviarán desde tu dirección.</p>
        <p style="color:#94a3b8;font-size:13px">— Coach Jotaze · JTZ Running Club</p>
      </div>
    `),
  });
}

function baseTemplate(content: string) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#0f0f1e;margin:0;padding:0}
    .wrapper{max-width:560px;margin:40px auto}
    .header{background:linear-gradient(135deg,#f97316,#dc2626);padding:32px 24px;border-radius:16px 16px 0 0;text-align:center}
    .header h1{color:white;margin:0;font-size:26px;font-weight:900}
    .header p{color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px}
    .body{background:#161626;padding:32px 28px;border-radius:0 0 16px 16px}
    .body p{color:#cbd5e1;font-size:15px;line-height:1.6;margin:0 0 16px}
    .info-box{background:#1e1e30;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px 24px;margin:20px 0}
    .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
    .info-row:last-child{border-bottom:none}
    .info-label{color:#64748b;font-size:13px}
    .info-value{color:#ffffff;font-size:13px;font-weight:600}
    .footer{text-align:center;padding:24px;color:#475569;font-size:12px}
  </style></head><body>
  <div class="wrapper">${content}
    <div class="footer"><p>© JTZ Running Club · México</p></div>
  </div></body></html>`;
}

export async function sendRegistrationConfirmation(opts: {
  to: string;
  nombre: string;
  eventName: string;
  eventDate: string;
  eventPlace: string;
  eventCity: string;
  distanciaKm?: number | null;
  precio: number;
  tipo: string;
  coachUserId?: number;
}) {
  const { transporter, from } = await getTransportForUser(opts.coachUserId);
  const tipoEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };

  const html = baseTemplate(`
    <div class="header"><h1>${tipoEmoji[opts.tipo] ?? '🏃'} ¡Inscripción confirmada!</h1><p>JTZ Running Club</p></div>
    <div class="body">
      <p>¡Hola, <strong style="color:white">${opts.nombre}</strong>! 🎉</p>
      <p>Tu inscripción fue registrada exitosamente:</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Evento</span><span class="info-value">${opts.eventName}</span></div>
        <div class="info-row"><span class="info-label">Fecha</span><span class="info-value">${opts.eventDate}</span></div>
        <div class="info-row"><span class="info-label">Lugar</span><span class="info-value">${opts.eventPlace}, ${opts.eventCity}</span></div>
        ${opts.distanciaKm ? `<div class="info-row"><span class="info-label">Distancia</span><span class="info-value">${opts.distanciaKm} km</span></div>` : ''}
        <div class="info-row"><span class="info-label">Inscripción</span><span class="info-value" style="color:#4ade80">${opts.precio === 0 ? '✓ Gratis' : `$${opts.precio.toLocaleString('es-MX')} MXN — Pagado`}</span></div>
      </div>
      <p>¡Nos vemos en la carrera! 💪<br/><strong style="color:white">Coach Jotaze · JTZ Running Club</strong></p>
    </div>
  `);

  await transporter.sendMail({ from, to: opts.to, subject: `✅ Inscripción confirmada — ${opts.eventName}`, html });
}

export async function sendEventNotification(opts: {
  recipients: { nombre: string; email: string }[];
  eventId: number;
  eventName: string;
  eventDate: string;
  eventPlace: string;
  eventCity: string;
  eventType: string;
  distanciaKm?: number | null;
  precio: number;
  coachUserId?: number;
}): Promise<void> {
  const { transporter, from } = await getTransportForUser(opts.coachUserId);
  const tipoEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };
  const emoji = tipoEmoji[opts.eventType] ?? '🏃';
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const eventoUrl = `${frontendUrl}/evento/${opts.eventId}`;
  const btnLabel = opts.precio === 0 ? '¡Inscribirme gratis!' : `¡Pagar e inscribirme · $${opts.precio.toLocaleString('es-MX')} MXN!`;

  for (const r of opts.recipients) {
    const html = baseTemplate(`
      <div class="header"><h1>${emoji} Nuevo evento JTZ</h1><p>JTZ Running Club</p></div>
      <div class="body">
        <p>¡Hola, <strong style="color:white">${r.nombre}</strong>! 👋</p>
        <p>Se acaba de publicar un nuevo evento:</p>
        <div class="info-box">
          <div class="info-row"><span class="info-label">Evento</span><span class="info-value">${opts.eventName}</span></div>
          <div class="info-row"><span class="info-label">Fecha</span><span class="info-value">${opts.eventDate}</span></div>
          <div class="info-row"><span class="info-label">Lugar</span><span class="info-value">${opts.eventPlace}${opts.eventCity ? `, ${opts.eventCity}` : ''}</span></div>
          ${opts.distanciaKm ? `<div class="info-row"><span class="info-label">Distancia</span><span class="info-value">${opts.distanciaKm} km</span></div>` : ''}
          <div class="info-row"><span class="info-label">Precio</span><span class="info-value" style="color:#4ade80">${opts.precio === 0 ? '✓ Gratis' : `$${opts.precio.toLocaleString('es-MX')} MXN`}</span></div>
        </div>

        <div style="text-align:center;margin:28px 0 8px">
          <a href="${eventoUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#dc2626);color:white;font-weight:900;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;letter-spacing:0.3px">
            ${btnLabel}
          </a>
        </div>
        <p style="text-align:center;font-size:12px;color:#64748b;margin-top:6px">
          O copia este enlace: <a href="${eventoUrl}" style="color:#f97316">${eventoUrl}</a>
        </p>

        <p style="margin-top:24px;color:#94a3b8;font-size:13px">— Coach · JTZ Running Club</p>
      </div>
    `);
    await transporter.sendMail({ from, to: r.email, subject: `${emoji} Nuevo evento: ${opts.eventName}`, html });
  }
}

export async function sendBulkUpdate(opts: {
  recipients: { nombre: string; email: string }[];
  eventName: string;
  subject: string;
  mensaje: string;
  coachUserId?: number;
}) {
  const { transporter, from } = await getTransportForUser(opts.coachUserId);
  for (const r of opts.recipients) {
    const html = baseTemplate(`
      <div class="header"><h1>📢 Actualización del evento</h1><p>${opts.eventName}</p></div>
      <div class="body">
        <p>Hola, <strong style="color:white">${r.nombre}</strong> 👋</p>
        <div style="white-space:pre-wrap;color:#cbd5e1;font-size:15px;line-height:1.7">${opts.mensaje}</div>
        <p style="margin-top:24px;color:#94a3b8;font-size:13px">— Coach Jotaze · JTZ Running Club</p>
      </div>
    `);
    await transporter.sendMail({ from, to: r.email, subject: opts.subject, html });
  }
}

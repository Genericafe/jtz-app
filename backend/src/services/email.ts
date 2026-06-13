import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StoredEmailConfig {
  provider: string; verified: boolean; fromEmail: string; fromName: string;
  smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string;
  oauthAccessToken: string | null; oauthRefreshToken: string | null;
}

interface SendOpts { from: string; to: string; subject: string; html: string; }
type Sender = (opts: SendOpts) => Promise<void>;

// ── Gmail REST API sender (bypasses SMTP/IPv6 — uses HTTPS port 443) ──────────
async function gmailApiSender(_userEmail: string, refreshToken: string): Promise<Sender> {
  return async (opts: SendOpts) => {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    client.setCredentials({ refresh_token: refreshToken });

    const raw = [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      opts.html,
    ].join('\r\n');

    const encoded = Buffer.from(raw).toString('base64url');

    await client.request({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      data: { raw: encoded },
    });
  };
}

// ── SMTP sender (Outlook / custom SMTP) ───────────────────────────────────────
function smtpSender(host: string, port: number, user: string, pass: string, fromOverride?: string): Sender {
  const cleanPass = pass?.replace(/\s/g, '') ?? '';
  let transport: object = { host, port, secure: port === 465, requireTLS: port === 587, auth: { user, pass: cleanPass }, tls: { minVersion: 'TLSv1.2' } };
  if (host === 'smtp.office365.com') {
    transport = { host, port: 587, secure: false, requireTLS: true, auth: { user, pass: cleanPass }, tls: { ciphers: 'SSLv3', minVersion: 'TLSv1.2' } };
  }
  const transporter = nodemailer.createTransport(transport as object);
  return async (opts: SendOpts) => {
    await transporter.sendMail({ ...opts, from: fromOverride ?? opts.from });
  };
}

// ── Resolve sender for a coach userId ─────────────────────────────────────────
async function getSender(userId?: number): Promise<{ send: Sender; from: string }> {
  if (userId) {
    const cfg = await prisma.emailConfig.findUnique({ where: { userId } }) as StoredEmailConfig | null;
    if (cfg?.verified) {
      const from = `${cfg.fromName} <${cfg.fromEmail}>`;
      if (cfg.provider === 'google_oauth' && cfg.oauthRefreshToken) {
        const send = await gmailApiSender(cfg.fromEmail, cfg.oauthRefreshToken);
        return { send, from };
      }
      return { send: smtpSender(cfg.smtpHost, cfg.smtpPort, cfg.smtpUser, cfg.smtpPass), from };
    }
  }
  // No config — log only, don't crash
  return {
    send: async (opts) => console.log(`[email] No config — would send to ${opts.to}: ${opts.subject}`),
    from: 'JTZ Running Club <noreply@jtz.mx>',
  };
}

// ── Test OAuth (from /settings/email/test) ────────────────────────────────────
export async function testOAuthEmail(
  userEmail: string,
  fromName: string,
  _accessToken: string | null,
  refreshToken: string,
): Promise<void> {
  const send = await gmailApiSender(userEmail, refreshToken);
  await send({
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
}

// ── Test SMTP config ──────────────────────────────────────────────────────────
export async function testSmtpConfig(config: {
  host: string; port: number; secure: boolean;
  auth: { user: string; pass: string }; from: string; to: string;
}): Promise<void> {
  const send = smtpSender(config.host, config.port, config.auth.user, config.auth.pass);
  await send({ from: config.from, to: config.to, subject: '✅ JTZ — Correo de prueba', html: baseTemplate(`
    <div class="header"><h1>✅ Conexión exitosa</h1><p>JTZ Running Club</p></div>
    <div class="body"><p>¡Tu cuenta de correo está conectada correctamente con JTZ!</p></div>
  `) });
}

// ── HTML template ─────────────────────────────────────────────────────────────
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

// ── Exported email functions ───────────────────────────────────────────────────
export async function sendRegistrationConfirmation(opts: {
  to: string; nombre: string; eventName: string; eventDate: string;
  eventPlace: string; eventCity: string; distanciaKm?: number | null;
  precio: number; tipo: string; coachUserId?: number;
}) {
  const { send, from } = await getSender(opts.coachUserId);
  const emoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };
  await send({ from, to: opts.to, subject: `✅ Inscripción confirmada — ${opts.eventName}`, html: baseTemplate(`
    <div class="header"><h1>${emoji[opts.tipo] ?? '🏃'} ¡Inscripción confirmada!</h1><p>JTZ Running Club</p></div>
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
      <p>¡Nos vemos en la carrera! 💪<br/><strong style="color:white">Coach JTZ Running Club</strong></p>
    </div>
  `) });
}

export async function sendEventNotification(opts: {
  recipients: { nombre: string; email: string }[];
  eventId: number; eventName: string; eventDate: string;
  eventPlace: string; eventCity: string; eventType: string;
  distanciaKm?: number | null; precio: number; coachUserId?: number;
}): Promise<void> {
  const { send, from } = await getSender(opts.coachUserId);
  const emoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };
  const e = emoji[opts.eventType] ?? '🏃';
  const url = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/evento/${opts.eventId}`;
  const btn = opts.precio === 0 ? '¡Inscribirme gratis!' : `¡Pagar e inscribirme · $${opts.precio.toLocaleString('es-MX')} MXN!`;

  for (const r of opts.recipients) {
    await send({ from, to: r.email, subject: `${e} Nuevo evento: ${opts.eventName}`, html: baseTemplate(`
      <div class="header"><h1>${e} Nuevo evento JTZ</h1><p>JTZ Running Club</p></div>
      <div class="body">
        <p>¡Hola, <strong style="color:white">${r.nombre}</strong>! 👋</p>
        <div class="info-box">
          <div class="info-row"><span class="info-label">Evento</span><span class="info-value">${opts.eventName}</span></div>
          <div class="info-row"><span class="info-label">Fecha</span><span class="info-value">${opts.eventDate}</span></div>
          <div class="info-row"><span class="info-label">Lugar</span><span class="info-value">${opts.eventPlace}${opts.eventCity ? `, ${opts.eventCity}` : ''}</span></div>
          ${opts.distanciaKm ? `<div class="info-row"><span class="info-label">Distancia</span><span class="info-value">${opts.distanciaKm} km</span></div>` : ''}
          <div class="info-row"><span class="info-label">Precio</span><span class="info-value" style="color:#4ade80">${opts.precio === 0 ? '✓ Gratis' : `$${opts.precio.toLocaleString('es-MX')} MXN`}</span></div>
        </div>
        <div style="text-align:center;margin:28px 0 8px">
          <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#dc2626);color:white;font-weight:900;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">${btn}</a>
        </div>
        <p style="margin-top:24px;color:#94a3b8;font-size:13px">— Coach · JTZ Running Club</p>
      </div>
    `) });
  }
}

export async function sendBulkUpdate(opts: {
  recipients: { nombre: string; email: string }[];
  eventName: string; subject: string; mensaje: string; coachUserId?: number;
}) {
  const { send, from } = await getSender(opts.coachUserId);
  for (const r of opts.recipients) {
    await send({ from, to: r.email, subject: opts.subject, html: baseTemplate(`
      <div class="header"><h1>📢 Actualización del evento</h1><p>${opts.eventName}</p></div>
      <div class="body">
        <p>Hola, <strong style="color:white">${r.nombre}</strong> 👋</p>
        <div style="white-space:pre-wrap;color:#cbd5e1;font-size:15px;line-height:1.7">${opts.mensaje}</div>
        <p style="margin-top:24px;color:#94a3b8;font-size:13px">— Coach JTZ Running Club</p>
      </div>
    `) });
  }
}

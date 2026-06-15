import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging, SendResponse } from 'firebase-admin/messaging';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function init() {
  if (getApps().length > 0) return;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) { console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT no configurado — push desactivado'); return; }
  try {
    initializeApp({ credential: cert(JSON.parse(sa)) });
    console.log('[FCM] Firebase Admin inicializado');
  } catch (err) {
    console.error('[FCM] Error al inicializar Firebase:', err);
  }
}

init();

function isReady() { return getApps().length > 0; }

async function cleanInvalidTokens(tokens: string[], responses: SendResponse[]) {
  const invalid = tokens.filter((_, i) => {
    const code = responses[i]?.error?.code ?? '';
    return code === 'messaging/invalid-registration-token' ||
           code === 'messaging/registration-token-not-registered';
  });
  if (invalid.length > 0) {
    await (prisma as any).pushToken.deleteMany({ where: { token: { in: invalid } } });
  }
}

export async function sendToUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, string> = {},
) {
  if (!isReady()) return;
  const rows = await (prisma as any).pushToken.findMany({ where: { userId }, select: { token: true } });
  const tokens: string[] = rows.map((r: { token: string }) => r.token);
  if (tokens.length === 0) return;

  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
      android: { priority: 'high', notification: { sound: 'default', channelId: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    await cleanInvalidTokens(tokens, res.responses);
  } catch (err) {
    console.error('[FCM] sendToUser error:', err);
  }
}

export async function sendToAllRunners(
  title: string,
  body: string,
  data: Record<string, string> = {},
) {
  if (!isReady()) return;
  const rows = await (prisma as any).pushToken.findMany({
    include: { user: { select: { role: true } } },
  });
  const tokens: string[] = rows
    .filter((r: any) => r.user.role === 'runner')
    .map((r: any) => r.token);
  if (tokens.length === 0) return;

  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
      android: { priority: 'high', notification: { sound: 'default', channelId: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    await cleanInvalidTokens(tokens, res.responses);
  } catch (err) {
    console.error('[FCM] sendToAllRunners error:', err);
  }
}

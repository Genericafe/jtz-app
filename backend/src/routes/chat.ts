import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, coachOnly, AuthRequest } from '../middleware/auth';
import { encrypt, decrypt } from '../services/chatCrypto';
import { sendToUser } from '../services/pushNotifications';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /chat — coach only: list of all runners (with message stats if any)
router.get('/', coachOnly, async (req: AuthRequest, res: Response) => {
  try {
    const coachId = req.userId!;

    // Get all runners with their user info
    const runners = await prisma.runner.findMany({
      where: { activo: true },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { nombre: 'asc' },
    });

    // Get message stats per runner
    const conversationData = await Promise.all(
      runners.map(async (runner) => {
        const runnerId = runner.userId; // userId of the runner (used as senderId/receiverId in ChatMessage)

        const messages = await (prisma as any).chatMessage.findMany({
          where: {
            OR: [
              { senderId: coachId, receiverId: runnerId },
              { senderId: runnerId, receiverId: coachId },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        });

        const unreadCount = await (prisma as any).chatMessage.count({
          where: {
            senderId: runnerId,
            receiverId: coachId,
            leido: false,
          },
        });

        const lastMsg = messages[0] ?? null;
        let lastMessagePreview: string | null = null;
        if (lastMsg) {
          try {
            lastMessagePreview = decrypt(lastMsg.content);
          } catch {
            lastMessagePreview = '(mensaje cifrado)';
          }
        }

        return {
          runner: {
            id: runner.id,
            userId: runner.userId,
            nombre: runner.nombre,
            apellido: runner.apellido,
            nivel: runner.nivel,
            user: runner.user,
          },
          lastMessagePreview,
          lastMessageAt: lastMsg?.createdAt ?? null,
          unreadCount,
          hasMessages: messages.length > 0,
        };
      })
    );

    return res.json(conversationData);
  } catch (err) {
    console.error('[chat GET /]', err);
    return res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

// GET /chat/:runnerId — coach or the runner themselves: full message history
// :runnerId = Runner.id (not userId)
router.get('/:runnerId', async (req: AuthRequest, res: Response) => {
  try {
    const myUserId = req.userId!;
    const myRole = req.userRole!;
    const runnerRecordId = parseInt(req.params.runnerId, 10);

    if (isNaN(runnerRecordId)) return res.status(400).json({ error: 'ID inválido' });

    // Resolve the runner's userId
    const runnerRecord = await prisma.runner.findUnique({ where: { id: runnerRecordId } });
    if (!runnerRecord) return res.status(404).json({ error: 'Corredor no encontrado' });
    const runnerUserId = runnerRecord.userId;

    // Resolve coachUserId
    let coachUserId: number;
    if (myRole === 'coach') {
      coachUserId = myUserId;
      // Coach can read anyone's conversation
    } else {
      // Runner: can only read their own conversation
      if (runnerUserId !== myUserId) {
        return res.status(403).json({ error: 'No autorizado' });
      }
      // Find coach
      const coachUser = await prisma.user.findFirst({ where: { role: 'coach' } });
      if (!coachUser) return res.status(404).json({ error: 'Coach no encontrado' });
      coachUserId = coachUser.id;
    }

    // Fetch all messages between coach and runner
    const messages = await (prisma as any).chatMessage.findMany({
      where: {
        OR: [
          { senderId: coachUserId, receiverId: runnerUserId },
          { senderId: runnerUserId, receiverId: coachUserId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Mark unread messages as read (messages sent to me)
    await (prisma as any).chatMessage.updateMany({
      where: {
        senderId: myRole === 'coach' ? runnerUserId : coachUserId,
        receiverId: myUserId,
        leido: false,
      },
      data: { leido: true },
    });

    // Decrypt and shape response
    const result = messages.map((msg: any) => {
      let content = msg.content;
      try {
        content = decrypt(msg.content);
      } catch {
        content = '(mensaje no legible)';
      }
      return {
        id: msg.id,
        senderId: msg.senderId,
        content,
        leido: msg.leido,
        createdAt: msg.createdAt,
        fromMe: msg.senderId === myUserId,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('[chat GET /:runnerId]', err);
    return res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

// POST /chat/:runnerId — send a message
// :runnerId = Runner.id (not userId)
router.post('/:runnerId', async (req: AuthRequest, res: Response) => {
  try {
    const myUserId = req.userId!;
    const myRole = req.userRole!;
    const runnerRecordId = parseInt(req.params.runnerId, 10);
    const { content } = req.body;

    if (isNaN(runnerRecordId)) return res.status(400).json({ error: 'ID inválido' });
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }

    // Resolve runner's userId
    const runnerRecord = await prisma.runner.findUnique({ where: { id: runnerRecordId } });
    if (!runnerRecord) return res.status(404).json({ error: 'Corredor no encontrado' });
    const runnerUserId = runnerRecord.userId;

    let senderId: number;
    let receiverId: number;

    if (myRole === 'coach') {
      // Coach sends to runner
      senderId = myUserId;
      receiverId = runnerUserId;
    } else {
      // Runner: can only message their own coach conversation
      if (runnerUserId !== myUserId) {
        return res.status(403).json({ error: 'No autorizado' });
      }
      // Find coach
      const coachUser = await prisma.user.findFirst({ where: { role: 'coach' } });
      if (!coachUser) return res.status(404).json({ error: 'Coach no encontrado' });
      senderId = myUserId;
      receiverId = coachUser.id;
    }

    const encryptedContent = encrypt(content.trim());

    const newMsg = await (prisma as any).chatMessage.create({
      data: {
        senderId,
        receiverId,
        content: encryptedContent,
        leido: false,
      },
    });

    // Push notification al receptor (fire-and-forget)
    const senderLabel = myRole === 'coach' ? 'Coach' : `${runnerRecord.nombre} ${runnerRecord.apellido}`;
    sendToUser(receiverId, `Mensaje de ${senderLabel}`, content.trim(), { type: 'chat' }).catch(() => {});

    return res.status(201).json({
      id: newMsg.id,
      senderId: newMsg.senderId,
      content: content.trim(),
      leido: newMsg.leido,
      createdAt: newMsg.createdAt,
      fromMe: true,
    });
  } catch (err) {
    console.error('[chat POST /:runnerId]', err);
    return res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

export default router;

import dns from 'dns';
// Forzar IPv4 en Railway (bloquea IPv6 saliente, afecta SMTP de Gmail)
if (typeof (dns as any).setDefaultResultOrder === 'function') {
  (dns as any).setDefaultResultOrder('ipv4first');
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import runnerRoutes from './routes/runners';
import planRoutes from './routes/plans';
import eventRoutes from './routes/events';
import paymentRoutes from './routes/payments';
import productRoutes from './routes/products';
import announcementRoutes from './routes/announcements';
import stripeRoutes from './routes/stripe';
import publicRoutes from './routes/public';
import leadsRoutes from './routes/leads';
import settingsRoutes from './routes/settings';
import aiRoutes from './routes/ai';
import chatRoutes from './routes/chat';

dotenv.config();

process.on('uncaughtException',  (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const app = express();
const PORT = process.env.PORT ?? 3001;

const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.some(o => origin.startsWith(o))),
  credentials: true,
}));

// Webhooks need raw body — register before express.json()
app.use('/api/public/webhook/stripe', express.raw({ type: 'application/json' }));
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/runners', runnerRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/coach', leadsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'JTZ API' }));

app.listen(PORT, () => {
  console.log(`JTZ API corriendo en http://localhost:${PORT}`);
});

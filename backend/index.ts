import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

import adminRoutes      from '@/routes/admin';
import studentRoutes    from '@/routes/students';
import userRoutes       from '@/routes/users';
import auditRoutes      from '@/routes/audit';
import walletRoutes     from '@/routes/wallet';
import menuRoutes       from '@/routes/menu';
import posRoutes        from '@/routes/pos';
import inventoryRoutes  from '@/routes/inventory';
import financeRoutes    from '@/routes/finance';
import parentRoutes     from '@/routes/parents';
import mpesaRoutes      from '@/routes/mpesa';
import { getSupabaseConfigError, isSupabaseConfigured } from '@/services/supabase';

const app = express();
const PORT         = process.env.PORT         || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const server = http.createServer(app);

const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter((o, i, arr) => o && arr.indexOf(o) === i);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join_checkout', ({ checkoutRequestId }: { checkoutRequestId: string }) => {
    if (checkoutRequestId) {
      socket.join(checkoutRequestId);
      console.log(`Socket ${socket.id} joined room ${checkoutRequestId}`);
    }
  });

  socket.on('disconnect', (reason: string) => {
    console.log('Socket disconnected:', socket.id, reason);
  });
});

const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    callback(null, true);
  } else {
    callback(null, false);
  }
};

app.set('etag', false);
app.use(express.json());
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/admin',       adminRoutes);
app.use('/api/students',    studentRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/audit',       auditRoutes);
app.use('/api/wallet',      walletRoutes);
app.use('/api/menu',        menuRoutes);
app.use('/api/pos',         posRoutes);
app.use('/api/inventory',   inventoryRoutes);
app.use('/api/finance',     financeRoutes);
app.use('/api/parents',     parentRoutes);
app.use('/api',             mpesaRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, () => {
  console.log(`\nSmartPOS backend running on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}\n`);
  if (!isSupabaseConfigured()) {
    console.warn('Supabase storage:', getSupabaseConfigError());
    console.warn('Menu image uploads will fail until SUPABASE_SERVICE_ROLE_KEY is set correctly.\n');
  }
});

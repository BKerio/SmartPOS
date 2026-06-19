import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';

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

const app = express();
const PORT         = process.env.PORT         || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
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

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  SmartPOS backend running on http://localhost:${PORT}`);
  console.log(`📡  Accepting requests from: ${FRONTEND_URL}\n`);
});

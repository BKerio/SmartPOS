import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';

import adminRoutes      from '@/routes/admin';
import studentRoutes    from '@/routes/students';
import userRoutes       from '@/routes/users';
import propertyRoutes   from '@/routes/properties';
import marketplaceRoutes from '@/routes/marketplace';
import auditRoutes      from '@/routes/audit';

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
app.use('/api/properties',  propertyRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/audit',       auditRoutes);

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  SmartPOS backend running on http://localhost:${PORT}`);
  console.log(`📡  Accepting requests from: ${FRONTEND_URL}\n`);
});

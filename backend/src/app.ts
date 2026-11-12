import Fastify, { FastifyInstance, LogController } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import '@/lib/http';
import { ALLOWED_ORIGINS } from '@/lib/env';
import { createSocketServer } from '@/lib/socket';
import { checkDatabase } from '@/services/prisma';
import { registerReadCache } from '@/services/readCache';

import authRoutes from '@/modules/auth/auth.routes';
import adminRoutes from '@/modules/admin/admin.routes';
import backupRoutes from '@/modules/backup/backup.routes';
import studentRoutes from '@/modules/students/students.routes';
import userRoutes from '@/modules/users/users.routes';
import auditRoutes from '@/modules/audit/audit.routes';
import walletRoutes from '@/modules/wallet/wallet.routes';
import menuRoutes from '@/modules/menu/menu.routes';
import posRoutes from '@/modules/pos/pos.routes';
import inventoryRoutes from '@/modules/inventory/inventory.routes';
import financeRoutes from '@/modules/finance/finance.routes';
import parentRoutes from '@/modules/parents/parents.routes';
import kopokopoRoutes from '@/modules/kopokopo/kopokopo.routes';
import fingerprintScannerRoutes from '@/modules/fingerprint-scanner/fingerprint-scanner.routes';
import attendanceRoutes from '@/modules/attendance/attendance.routes';
import invoiceRoutes from '@/modules/invoices/invoices.routes';
import procurementRoutes from '@/modules/procurement/procurement.routes';
import reportRoutes from '@/modules/reports/reports.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    // Handlers log what matters themselves; per-request access logs would flood pm2.
    logController: new LogController({ disableRequestLogging: true }),
    routerOptions: { ignoreTrailingSlash: true },
    // nginx on the same host is the only proxy, so only trust X-Forwarded-For from loopback.
    trustProxy: ['127.0.0.1', '::1'],
  });

  app.decorate('io', createSocketServer(app.server, ALLOWED_ORIGINS));

  // ── Body parsing ────────────────────────────────────────────────────────────
  // JSON only, like express.json(): an empty body becomes {}, and the raw bytes
  // are kept for /kopokopo/ routes so webhook signatures can be verified.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    const buf = body as Buffer;
    if (req.url.includes('/kopokopo/')) req.rawBody = buf;
    if (buf.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(buf.toString('utf8')));
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      error.statusCode = 400;
      done(error, undefined);
    }
  });
  // Other content types are ignored rather than rejected (handlers then see an empty body).
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, _body, done) => done(null, {}));
  await app.register(multipart);

  // Handlers destructure req.body, so give requests without a body an empty object.
  app.addHook('preValidation', async (req) => {
    if (req.body === undefined || req.body === null) req.body = {};
  });

  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
      reply.header('Pragma', 'no-cache');
    }
  });

  // Any successful write (sale, payment webhook, allocation, wallet change, import…) can change money
  // figures, so drop the cached Collections report; the next read rebuilds it.
  // Shared list endpoints are served from memory and cleared on every successful write
  // (also invalidates the collections report and the staff-name cache).
  registerReadCache(app);

  // Set before the route plugins are registered: each plugin keeps the handlers present at that point.
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'Route not found' });
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    reply.status(status).send({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    const dbOk = await checkDatabase();
    return reply.status(dbOk ? 200 : 503).send({
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'connected' : 'unreachable',
      timestamp: new Date().toISOString(),
    });
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(backupRoutes, { prefix: '/api/admin/backup' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(studentRoutes, { prefix: '/api/students' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(auditRoutes, { prefix: '/api/audit' });
  await app.register(walletRoutes, { prefix: '/api/wallet' });
  await app.register(menuRoutes, { prefix: '/api/menu' });
  await app.register(posRoutes, { prefix: '/api/pos' });
  await app.register(inventoryRoutes, { prefix: '/api/inventory' });
  await app.register(financeRoutes, { prefix: '/api/finance' });
  await app.register(parentRoutes, { prefix: '/api/parents' });
  await app.register(kopokopoRoutes, { prefix: '/api/kopokopo' });
  await app.register(fingerprintScannerRoutes, { prefix: '/api/fingerprint-scanner' });
  await app.register(attendanceRoutes, { prefix: '/api/attendance' });
  await app.register(invoiceRoutes, { prefix: '/api/invoices' });
  await app.register(procurementRoutes, { prefix: '/api/procurement' });
  await app.register(reportRoutes, { prefix: '/api/reports' });

  return app;
}

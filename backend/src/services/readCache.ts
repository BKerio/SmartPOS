import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { invalidateCollections, scheduleCollectionsRefresh } from '@/services/collectionsQuery';
import { onDatabaseWrite } from '@/services/prisma';

/*
 * In-memory cache for the shared, read-heavy list endpoints (the trick that makes the dashboard fast).
 *
 * - Only routes in CACHEABLE are cached, and only the ones whose answer depends on the caller's ROLE,
 *   not on who they are (no "my wallet", "my attendance"...). The key is role + full URL.
 * - It sits in preHandler, i.e. after each route's onRequest auth check, so a cached body is never
 *   served to someone the route itself would refuse.
 * - Any database write made by this server clears everything (Prisma's query events: see onDatabaseWrite),
 *   whether it came from a POST, a webhook, an M-Pesa status poll or a background job. TTL covers
 *   changes made by another server process or directly in the database.
 * - A generation counter stops a read that started before a write from storing pre-write data.
 */
const TTL_MS = Number(process.env.READ_CACHE_TTL_MS) || 60_000;
const MAX_ENTRIES = 500;

const CACHEABLE = new Set([
  '/api/students',
  '/api/parents',
  '/api/users',
  '/api/menu',
  '/api/menu/all',
  '/api/menu/categories',
  '/api/menu/display',
  '/api/menu/kitchen-board',
  '/api/inventory/items',
  '/api/inventory/suppliers',
  '/api/inventory/movements',
  '/api/pos/receipts',
  '/api/pos/sales/summary',
  '/api/finance/summary',
  '/api/finance/expenses',
  '/api/audit/events',
  '/api/invoices',
  '/api/invoices/waiters',
  '/api/invoices/:id',
  '/api/reports/daily',
  '/api/procurement/ledger',
  '/api/procurement/stock-card/:itemId',
  '/api/admin/dashboard',
  '/api/admin/backup/summary',
]);

type Entry = { body: string; contentType: string; at: number };
const store = new Map<string, Entry>();
let generation = 0;

declare module 'fastify' {
  interface FastifyRequest {
    readCacheKey?: string;
    readCacheGen?: number;
  }
}

function keyFor(req: FastifyRequest): string | null {
  if (req.method !== 'GET') return null;
  const route = req.routeOptions?.url;
  if (!route || !CACHEABLE.has(route)) return null;
  if ((req.query as Record<string, unknown>)?.fresh) return null;
  const role = (req as FastifyRequest & { user?: { role?: string } }).user?.role ?? 'public';
  return `${role}|${req.url}`;
}

export function clearReadCache(): void {
  generation++;
  store.clear();
}

export function registerReadCache(app: FastifyInstance): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const key = keyFor(req);
    if (!key) return;
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      reply.header('x-cache', 'hit').type(hit.contentType).send(hit.body);
      return reply;
    }
    req.readCacheKey = key;
    req.readCacheGen = generation;
  });

  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const key = req.readCacheKey;
    if (!key || reply.statusCode !== 200 || typeof payload !== 'string') return payload;
    if (req.readCacheGen !== generation) return payload; // a write landed while this was being read
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
    store.set(key, { body: payload, contentType: String(reply.getHeader('content-type') || 'application/json; charset=utf-8'), at: Date.now() });
    reply.header('x-cache', 'miss');
    return payload;
  });

  // Tables the Collections report is built from. Other writes (audit log, attendance, menu...) don't
  // touch it, so they no longer mark it stale or trigger a rebuild.
  const PAYMENT_TABLE = /"(kopo_payments|wallet_transactions|pos_transactions|pos_transaction_items|students)"/i;
  let paymentWriteInTx = false;
  onDatabaseWrite((sql) => {
    clearReadCache();
    if (PAYMENT_TABLE.test(sql)) {
      paymentWriteInTx = true;
      invalidateCollections();
      scheduleCollectionsRefresh();
    } else if (/^\s*COMMIT\b/i.test(sql) && paymentWriteInTx) {
      // The rows only become visible to other connections at COMMIT: invalidate again so a rebuild
      // that read before the commit isn't kept as current.
      paymentWriteInTx = false;
      invalidateCollections();
      scheduleCollectionsRefresh();
    }
  });
}

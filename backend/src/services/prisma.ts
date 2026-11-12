import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const RETRYABLE_CODES = new Set(['P1001', 'P1002', 'P1017']);

function isRetryableDbError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = String(err?.message ?? '');
  return (
    RETRYABLE_CODES.has(err?.code ?? '') ||
    message.includes("Can't reach database server") ||
    message.includes('Connection reset') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT')
  );
}

/**
 * Connection pool sizing.
 *
 * Prisma's default pool is small (num_cpus * 2 + 1) with a 10 s wait. The live system logged
 * "Timed out fetching a new connection from the connection pool" on POS sales, kiosk orders and payment
 * webhooks whenever a heavy report held connections, which is what staff experience as the system hanging.
 * A bigger pool and a longer wait remove those failures; heavy reports are also lighter now (indexes,
 * caching, server-side paging). Override with DB_CONNECTION_LIMIT / DB_POOL_TIMEOUT, or put
 * connection_limit / pool_timeout in DATABASE_URL (those win).
 */
function withPoolSettings(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', process.env.DB_CONNECTION_LIMIT || '20');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', process.env.DB_POOL_TIMEOUT || '20');
    return u.toString();
  } catch {
    return url;
  }
}

/*
 * Write notifications. In-memory read caches (services/readCache.ts, staff names, collections) must
 * drop their data after ANY change, including writes that don't come through a POST: the M-Pesa status
 * poll (a GET that can complete a sale or post an invoice payment), webhooks, background backfills.
 * Prisma's query event stream sees every statement, so caches subscribe here instead of each write site.
 * COMMIT fires again at the end of a transaction, so a read that ran mid-transaction can't stick.
 */
const writeListeners = new Set<(sql: string) => void>();
const WRITE_SQL = /^\s*(INSERT|UPDATE|DELETE|COMMIT)\b/i;

/** listener receives the statement text, so a subscriber can react only to the tables it cares about. */
export function onDatabaseWrite(listener: (sql: string) => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

/*
 * Neon pauses the database after a few idle minutes and closes every open connection; so can a network
 * blip. Prisma then logs "Error in PostgreSQL connection: Error { kind: Closed }" once per pooled
 * connection (up to 20 lines) and quietly reconnects on the next query, so nothing is actually wrong.
 * Collapse that into one plain warning a minute instead of a wall of errors.
 */
let lastClosedNotice = 0;
function logPrismaMessage(level: 'error' | 'warn', message: string) {
  if (/kind:\s*Closed|connection closed|Connection reset/i.test(message)) {
    if (Date.now() - lastClosedNotice > 60_000) {
      lastClosedNotice = Date.now();
      console.warn('[db] The database closed idle connections (Neon pauses after a few idle minutes). Reconnecting automatically on the next query.');
    }
    return;
  }
  (level === 'error' ? console.error : console.warn)(`prisma:${level} ${message}`);
}

function buildClient(url: string | undefined, transactionOptions: { maxWait: number; timeout: number }): PrismaClient {
  const client = new PrismaClient({
    ...(url ? { datasourceUrl: url } : {}),
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      ...(process.env.NODE_ENV === 'development' ? [{ emit: 'event' as const, level: 'warn' as const }] : []),
    ],
    transactionOptions,
  });
  client.$on('query', (e) => {
    if (writeListeners.size > 0 && WRITE_SQL.test(e.query)) for (const fn of writeListeners) fn(e.query);
  });
  client.$on('error', (e) => logPrismaMessage('error', e.message));
  if (process.env.NODE_ENV === 'development') client.$on('warn', (e) => logPrismaMessage('warn', e.message));
  return client as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  // Interactive transactions (sales, invoices, stock moves) make several round trips; the 5 s default
  // is too tight over a long network path and under load. Override with DB_TX_TIMEOUT_MS.
  return buildClient(withPoolSettings(process.env.DATABASE_URL), {
    maxWait: Number(process.env.DB_TX_MAX_WAIT_MS) || 10_000,
    timeout: Number(process.env.DB_TX_TIMEOUT_MS) || 20_000,
  });
}

/*
 * Client for long jobs (full backup export, restore): one transaction that can run for minutes.
 * It uses DIRECT_URL, Neon's direct (non-pooled) connection, which Neon recommends for long
 * transactions, and keeps its own small pool so a restore never starves the app's connections.
 * Created on first use; falls back to DATABASE_URL when DIRECT_URL isn't set.
 */
let longTaskClient: PrismaClient | null = null;
export function getLongTaskClient(): PrismaClient {
  if (!longTaskClient) {
    const base = process.env.DIRECT_URL || process.env.DATABASE_URL;
    let url = base;
    try {
      const u = new URL(base!);
      if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '2');
      if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '60');
      // Wait for a paused Neon compute to wake instead of failing the first query.
      if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '30');
      url = u.toString();
    } catch {
      /* use as-is */
    }
    longTaskClient = buildClient(url, { maxWait: 60_000, timeout: 30 * 60_000 });
  }
  return longTaskClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

/** Generated Prisma client type (includes all schema models). */
export type AppPrisma = typeof prisma;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === maxAttempts) throw error;
      console.warn(`Database unreachable — retrying (${attempt}/${maxAttempts - 1})...`);
      await prisma.$disconnect().catch(() => {});
      await new Promise((r) => setTimeout(r, 400 * attempt));
      await prisma.$connect().catch(() => {});
    }
  }
  throw new Error('Database query failed after retries');
}

export async function connectDatabase(): Promise<void> {
  await withDbRetry(() => prisma.$connect());
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await withDbRetry(() => prisma.$queryRaw`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

export default prisma;

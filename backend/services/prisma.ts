import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> };

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

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (!isRetryableDbError(error) || attempt === maxAttempts) throw error;
            console.warn(`Database unreachable — retrying (${attempt}/${maxAttempts - 1})...`);
            await client.$disconnect().catch(() => {});
            await new Promise((r) => setTimeout(r, 400 * attempt));
            await client.$connect().catch(() => {});
          }
        }
        throw new Error('Database query failed after retries');
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  const base = prisma as unknown as PrismaClient;
  await base.$connect();
}

export async function checkDatabase(): Promise<boolean> {
  try {
    const base = prisma as unknown as PrismaClient;
    await base.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default prisma;

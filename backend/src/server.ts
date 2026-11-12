import { ALLOWED_ORIGINS, PORT } from '@/lib/env';
import { buildApp } from '@/app';
import prisma, { connectDatabase } from '@/services/prisma';
import { getStorageConfigError } from '@/services/storage';
import { LIVE_KEY, collectionsFingerprint, getCollectionsFast, onCollectionsRebuilt, setLiveRefreshBuilder } from '@/services/collectionsQuery';
import { buildCollections } from '@/modules/finance/finance.routes';
import { warmStaffNames } from '@/services/staffNames';
import { backfillDailyNumbers } from '@/modules/pos/pos.routes';

async function main() {
  const app = await buildApp();

  // '::' accepts IPv4 and IPv6 like Express's default; fall back where IPv6 is disabled.
  await app.listen({ port: PORT, host: '::' }).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'EAFNOSUPPORT' && err.code !== 'EADDRNOTAVAIL') throw err;
    return app.listen({ port: PORT, host: '0.0.0.0' });
  });

  console.log(`\nSmartPOS backend (Fastify) running on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}\n`);

  try {
    await connectDatabase();
    console.log('Database connected');
    // Build the Collections report in the background so the first dashboard visit is instant.
    // Live updates: payments trigger a background rebuild; when the numbers actually change, every open
    // dashboard / Collections page is told to refetch (socket event "collections:updated").
    setLiveRefreshBuilder(() => buildCollections(undefined));
    let lastFingerprint = '';
    onCollectionsRebuilt((key, data) => {
      if (key !== LIVE_KEY) return;
      const fp = collectionsFingerprint(data);
      if (fp === lastFingerprint) return;
      const first = !lastFingerprint;
      lastFingerprint = fp;
      if (!first) app.io.emit('collections:updated', { at: Date.now(), total: data.rows.length });
    });
    getCollectionsFast(LIVE_KEY, () => buildCollections(undefined)).catch((err) => console.error('Collections warm-up failed:', err?.message || err));
    void warmStaffNames();
    backfillDailyNumbers()
      .then((n) => n > 0 && console.log(`Numbered ${n} past sales with their daily order number`))
      .catch((err) => console.error('Daily order number backfill failed:', err?.message || err));
  } catch (err: any) {
    console.error('Database connection failed on startup:', err?.message || err);
    console.error('Check the database is running and DATABASE_URL in backend/.env is correct.\n');
  }
  const storageError = getStorageConfigError();
  if (storageError) console.warn(`${storageError}\nMenu image uploads will fail until it is.\n`);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    // Drop websocket clients first, otherwise their open connections keep app.close() waiting.
    app.io.disconnectSockets(true);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

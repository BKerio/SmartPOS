import prisma from '@/services/prisma';

/*
 * id → display name for users and admins (cashiers, waiters, whoever recorded something).
 * Lists name a handful of staff over and over, and every lookup was an extra ~250 ms round trip to
 * the database after the main query. The table is small, so keep it in memory: names are served
 * from the cache, unknown ids (new staff) trigger one targeted query, and the whole map refreshes in
 * the background every few minutes, so a renamed account shows its new name within TTL_MS.
 */
const TTL_MS = 5 * 60_000;
let cache = new Map<string, string>();
let loadedAt = 0;
let loading: Promise<void> | null = null;

async function loadAll(): Promise<void> {
  const [users, admins] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.admin.findMany({ select: { id: true, name: true } }),
  ]);
  cache = new Map([...users, ...admins].map((u) => [u.id, u.name]));
  loadedAt = Date.now();
}

function ensureLoaded(): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return Promise.resolve();
  if (!loading) loading = loadAll().finally(() => { loading = null; });
  // A stale map is still right for nearly every id: serve it now and refresh in the background.
  return loadedAt > 0 ? Promise.resolve() : loading;
}

export async function staffNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  await ensureLoaded();
  const missing = unique.filter((id) => !cache.has(id));
  if (missing.length > 0) {
    const [users, admins] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } }),
      prisma.admin.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } }),
    ]);
    for (const u of [...users, ...admins]) cache.set(u.id, u.name);
  }
  return new Map(unique.filter((id) => cache.has(id)).map((id) => [id, cache.get(id)!]));
}

/** Warm on startup so the first list doesn't pay for it. */
export function warmStaffNames(): Promise<void> {
  return loadAll().catch(() => {});
}

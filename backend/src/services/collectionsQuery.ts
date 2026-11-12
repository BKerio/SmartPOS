/**
 * Server-side filtering, totals and pagination for the Collections report, plus a short-lived cache.
 *
 * Building the report means reading tens of thousands of rows (M-Pesa payments, wallet top-ups and
 * purchases, guest POS sales). The browser used to download all of them (~18 MB) and filter locally.
 * Now the server builds the rows once, keeps them for CACHE_TTL_MS, and answers each request with one
 * page plus the totals and filter counts. The filter rules below are the same as the frontend's
 * (pages/finance/CollectionsPage.tsx) so the numbers don't change.
 */

export type CollectionRow = {
  id?: string;
  source?: string;
  channel?: string;
  mpesaNumber?: string;
  date: Date | string;
  name?: string;
  admNo?: string;
  method?: string;
  amount: number;
  attemptedAmount?: number;
  status?: string;
  type?: string;
  metadata?: string;
  transactionRef?: string;
  walletCredited?: boolean;
  allocatable?: boolean;
  payload?: Record<string, unknown>;
};

export type CollectionsSummary = {
  tillInflow: number;
  walletTopUps: number;
  cashSales: number;
  usage: number;
  recordCount: number;
  uniqueTillPayments?: number;
  rawKopoBeforeDedupe?: number;
};

export type CollectionsData = { rows: CollectionRow[]; summary: CollectionsSummary };

export type StatusFilter = 'all' | 'success' | 'pending' | 'failed';
export const SOURCE_FILTERS = ['all', 'till', 'stk', 'student_wallets', 'wallet_topup', 'wallet_usage', 'unallocated', 'guest', 'cash'] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

// ── Filter rules (mirror of CollectionsPage.tsx) ──────────────────────────────
const MANUAL_TILL = /till → student wallet|manual allocation/i;

export const statusBucket = (status?: string): StatusFilter => {
  const s = (status || '').toLowerCase();
  if (['success', 'received', 'complete', 'completed', 'paid'].includes(s)) return 'success';
  if (['failed', 'error', 'reversed', 'cancelled', 'superseded'].includes(s)) return 'failed';
  return 'pending';
};
export const isGuestPosRow = (r: CollectionRow) =>
  r.source === 'pos_mpesa' || r.source === 'pos_cash' || (r.source === 'kopo' && r.type === 'pos_sale');
export const isWalletTopUpRow = (r: CollectionRow) =>
  (r.source === 'kopo' && r.type === 'wallet_topup') || (r.source === 'wallet' && r.type === 'deposit');
export const isWalletUsageRow = (r: CollectionRow) => r.source === 'wallet' && (r.type === 'purchase' || r.type === 'refund');

export const rowChannel = (r: CollectionRow): string => {
  const fromPayload = typeof r.payload?.channel === 'string' ? (r.payload.channel as string) : '';
  if (fromPayload) return fromPayload;
  if (r.channel) return r.channel;
  if (r.source === 'pos_cash') return 'cash';
  if (r.source === 'pos_mpesa' || (r.source === 'kopo' && (r.type === 'pos_sale' || r.type === 'invoice_payment'))) return 'stk';
  if (r.source === 'wallet') return 'wallet';
  if (r.source === 'kopo' && r.type === 'wallet_topup') return MANUAL_TILL.test(`${r.method} ${r.metadata}`) ? 'wallet' : 'stk';
  if (r.source === 'kopo') return 'till';
  return 'other';
};
const isTillBuyGoodsRow = (r: CollectionRow) =>
  rowChannel(r) === 'till' || (r.source === 'kopo' && r.type !== 'wallet_topup' && r.type !== 'pos_sale' && r.type !== 'invoice_payment');
const isStkPushRow = (r: CollectionRow) =>
  rowChannel(r) === 'stk' ||
  r.source === 'pos_mpesa' ||
  (r.source === 'kopo' && (r.type === 'pos_sale' || r.type === 'invoice_payment')) ||
  (r.source === 'kopo' && r.type === 'wallet_topup' && !MANUAL_TILL.test(`${r.method} ${r.metadata}`));

export const matchesSource = (r: CollectionRow, source: SourceFilter): boolean => {
  switch (source) {
    case 'all': return true;
    case 'till': return isTillBuyGoodsRow(r);
    case 'stk': return isStkPushRow(r);
    case 'student_wallets': return isWalletTopUpRow(r) || isWalletUsageRow(r);
    case 'wallet_topup': return isWalletTopUpRow(r);
    case 'wallet_usage': return isWalletUsageRow(r);
    case 'unallocated': return Boolean(r.allocatable);
    case 'cash': return r.source === 'pos_cash';
    case 'guest': return isGuestPosRow(r);
    default: return true;
  }
};

/** Totals for a filtered set, computed the way the page did (till inflow de-duplicated by M-Pesa ref). */
function totalsFor(list: CollectionRow[]) {
  const seen = new Set<string>();
  let tillInflow = 0;
  let walletTopUps = 0;
  let cashSales = 0;
  let usage = 0;
  for (const r of list) {
    if ((r.source === 'kopo' && r.amount > 0) || r.source === 'pos_mpesa') {
      const key = String(r.transactionRef || r.id || `${r.name}-${r.amount}-${r.date}`).trim().toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        tillInflow += Math.abs(r.amount);
      }
    }
    if (isWalletTopUpRow(r)) walletTopUps += Math.abs(r.amount);
    if (r.source === 'pos_cash') cashSales += r.amount;
    if (r.type === 'purchase' || isWalletUsageRow(r)) usage += Math.abs(r.amount);
  }
  return { tillInflow, walletTopUps, cashSales, usage };
}

export type CollectionsQuery = { source?: string; status?: string; search?: string; page?: number; limit?: number };

export function queryCollections(data: CollectionsData, q: CollectionsQuery) {
  const source: SourceFilter = (SOURCE_FILTERS as readonly string[]).includes(q.source || '') ? (q.source as SourceFilter) : 'all';
  const status: StatusFilter = ['success', 'pending', 'failed'].includes(q.status || '') ? (q.status as StatusFilter) : 'all';
  const search = (q.search || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500);

  // Chip counts reflect every row in the date range, like the page showed before.
  const sourceCounts = Object.fromEntries(
    SOURCE_FILTERS.map((s) => [s, s === 'all' ? data.rows.length : data.rows.filter((r) => matchesSource(r, s)).length]),
  ) as Record<SourceFilter, number>;

  let list = data.rows;
  if (source !== 'all') list = list.filter((r) => matchesSource(r, source));
  if (status !== 'all') list = list.filter((r) => statusBucket(r.status) === status);
  if (search) {
    list = list.filter((r) =>
      [r.name, r.admNo, r.metadata, r.method, r.status, r.transactionRef, r.mpesaNumber, r.type].join(' ').toLowerCase().includes(search),
    );
  }

  const filtered = source !== 'all' || status !== 'all' || search !== '';
  const totals = filtered
    ? totalsFor(list)
    : { tillInflow: data.summary.tillInflow, walletTopUps: data.summary.walletTopUps, cashSales: data.summary.cashSales, usage: data.summary.usage };

  const pages = Math.max(1, Math.ceil(list.length / limit));
  const page = Math.min(Math.max(Number(q.page) || 1, 1), pages);
  return {
    rows: list.slice((page - 1) * limit, page * limit),
    page,
    limit,
    pages,
    total: list.length,
    totalAll: data.rows.length,
    totals,
    sourceCounts,
    summary: data.summary,
  };
}

// ── Dashboard overview ────────────────────────────────────────────────────────
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isMoneyIn = (r: CollectionRow) => r.amount > 0 && (r.source === 'kopo' || r.source === 'pos_cash' || r.source === 'pos_mpesa');
const isWalletSpend = (r: CollectionRow) => isWalletUsageRow(r);

/** Daily money-in vs wallet-spend series, channel totals and latest transactions, for the admin dashboard. */
export function collectionsOverview(data: CollectionsData, days: number) {
  const n = [7, 14, 30, 90].includes(days) ? days : 14;
  const today = new Date();
  const series: { date: string; moneyIn: number; spend: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    series.push({ date: dayKey(d), moneyIn: 0, spend: 0 });
  }
  const byKey = new Map(series.map((s) => [s.date, s]));
  const totals = { moneyIn: 0, spend: 0, till: 0, stk: 0, cash: 0 };

  for (const r of data.rows) {
    const bucket = byKey.get(dayKey(new Date(r.date)));
    if (!bucket) continue;
    if (isMoneyIn(r)) {
      bucket.moneyIn += r.amount;
      totals.moneyIn += r.amount;
      const ch = r.source === 'pos_cash' ? 'cash' : r.source === 'pos_mpesa' ? 'stk' : rowChannel(r) === 'stk' ? 'stk' : 'till';
      totals[ch] += r.amount;
    } else if (isWalletSpend(r)) {
      bucket.spend += Math.abs(r.amount);
      totals.spend += Math.abs(r.amount);
    }
  }

  const recent = data.rows
    .filter((r) => isMoneyIn(r) || isWalletSpend(r))
    .slice(0, 7) // rows are already newest-first
    .map(({ payload: _payload, ...r }) => r);

  return {
    days: n,
    series,
    totals,
    recent,
    unallocated: data.rows.filter((r) => r.allocatable).length,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30_000;
type Entry = { at: number; data?: CollectionsData; pending?: Promise<CollectionsData>; stale?: boolean };
const cache = new Map<string, Entry>();

function rebuild(key: string, build: () => Promise<CollectionsData>): Promise<CollectionsData> {
  const existing = cache.get(key);
  if (existing?.pending) return existing.pending;
  const pending = build()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .catch((err) => {
      const prev = cache.get(key);
      // Keep serving the last good data if a rebuild fails.
      if (prev?.data) cache.set(key, { at: prev.at, data: prev.data, stale: true });
      else cache.delete(key);
      throw err;
    });
  cache.set(key, { ...(existing ?? { at: 0 }), pending });
  return pending;
}

/**
 * Exact figures: returns cached data only if it is fresh (younger than CACHE_TTL_MS and no write since);
 * otherwise rebuilds. Concurrent callers share one in-flight build. Used by the Collections page.
 */
export async function getCollections(key: string, build: () => Promise<CollectionsData>, fresh = false): Promise<CollectionsData> {
  const hit = cache.get(key);
  if (!fresh && hit?.data && !hit.stale && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  return rebuild(key, build);
}

/**
 * Fast figures: returns whatever is cached right away (even if a sale has happened since) and refreshes it
 * in the background. Only the very first call waits for a build. Used by the dashboard overview, where a
 * chart that is a few seconds behind is fine but a 10-second wait is not.
 */
export async function getCollectionsFast(key: string, build: () => Promise<CollectionsData>): Promise<CollectionsData> {
  const hit = cache.get(key);
  if (hit?.data) {
    if (hit.stale || Date.now() - hit.at >= CACHE_TTL_MS) rebuild(key, build).catch(() => {});
    return hit.data;
  }
  return rebuild(key, build);
}

/** Marks cached reports out of date after a write; the next exact read rebuilds, fast reads refresh in the background. */
export function invalidateCollections() {
  for (const [key, entry] of cache) cache.set(key, { ...entry, stale: true });
}

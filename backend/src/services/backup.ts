import { Prisma } from '@prisma/client';
import prisma, { getLongTaskClient } from '@/services/prisma';
import { getSystemSettings, setSystemSettings, SystemSettings } from '@/services/systemSettings';

/**
 * Full-database JSON backup / restore.
 *
 * File layout (keys use real Postgres table/column names so the file is usable
 * outside this app, e.g. loaded into any PostgreSQL DB with the same schema):
 *
 * {
 *   "format": "smartpos-backup", "version": 1, "exportedAt": "...", "exportedBy": {...},
 *   "settings": {...},
 *   "tables": {
 *     "students": { "model": "Student", "columns": [{ name, type, nullable }], "rows": [...], "rowCount": n },
 *     ...
 *   }
 * }
 */

export const BACKUP_FORMAT = 'smartpos-backup';
export const BACKUP_VERSION = 1;

const PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;

// Parents before children so inserts satisfy foreign keys (deletes run in reverse).
const MODEL_ORDER = [
  'Admin',
  'Parent',
  'Student',
  'User',
  'StaffAttendance',
  'WalletTransaction',
  'MenuCategory',
  'InventoryItem',
  'Supplier',
  'MenuItem',
  'ProductionBatch',
  'MenuItemIngredient',
  'PosTransaction',
  'PosTransactionItem',
  'StockMovement',
  'Expense',
  'AuditEvent',
  'KopoPayment',
  'PasswordReset',
];

type ScalarField = { name: string; column: string; type: string; nullable: boolean };
type ModelInfo = { name: string; table: string; delegate: string; fields: ScalarField[] };

/** Models in FK-safe order. Any model not listed above is appended so new tables are never skipped. */
export function getModels(): ModelInfo[] {
  const dmmfModels = Prisma.dmmf.datamodel.models;
  const byName = new Map(dmmfModels.map((m) => [m.name, m]));
  const ordered = [
    ...MODEL_ORDER.filter((n) => byName.has(n)),
    ...dmmfModels.map((m) => m.name).filter((n) => !MODEL_ORDER.includes(n)),
  ];

  return ordered.map((name) => {
    const m = byName.get(name)!;
    return {
      name,
      table: m.dbName || name,
      delegate: name.charAt(0).toLowerCase() + name.slice(1),
      fields: m.fields
        .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
        .map((f) => ({
          name: f.name,
          column: f.dbName || f.name,
          type: f.type,
          nullable: !f.isRequired,
        })),
    };
  });
}

const delegateOf = (client: any, model: ModelInfo) => client[model.delegate];

function toColumns(model: ModelInfo, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of model.fields) out[f.column] = row[f.name];
  return out;
}

export async function getTableCounts() {
  const models = getModels();
  // Single UNION ALL query = one round trip to the database. Table names come from the Prisma schema, not user input.
  const sql = models
    .map((m, i) => `SELECT ${i} AS i, count(*)::int AS n FROM "${m.table.replace(/"/g, '""')}"`)
    .join(' UNION ALL ');
  const rows = await prisma.$queryRawUnsafe<{ i: number; n: number }[]>(sql);
  const counts = new Map(rows.map((r) => [Number(r.i), Number(r.n)]));
  return models.map((m, i) => ({ table: m.table, model: m.name, rows: counts.get(i) ?? 0 }));
}

// ─── Export ───────────────────────────────────────────────────────────────────

/** Streams the backup JSON through `write` table by table, page by page. */
export async function writeBackup(
  write: (chunk: string) => Promise<void>,
  exportedBy: { id?: string; name?: string; email?: string },
): Promise<Record<string, number>> {
  const models = getModels();
  const counts: Record<string, number> = {};

  const header = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    database: 'postgresql',
    exportedAt: new Date().toISOString(),
    exportedBy,
    settings: getSystemSettings(),
  };
  // Open the object and leave it ready for the "tables" key.
  await write(JSON.stringify(header, null, 0).slice(0, -1) + ',"tables":{');

  // One REPEATABLE READ transaction = every table is read from the same point-in-time snapshot,
  // so sales/top-ups made while the export streams can't leave orphaned or half-written rows.
  // Long job: direct connection (see getLongTaskClient). SELECT 1 first wakes a paused Neon compute.
  const db = getLongTaskClient();
  await db.$queryRaw`SELECT 1`;
  await db.$transaction(
    async (tx) => {
      for (let t = 0; t < models.length; t++) {
        const model = models[t];
        const columns = model.fields.map((f) => ({ name: f.column, type: f.type, nullable: f.nullable }));
        await write(
          `${t ? ',' : ''}${JSON.stringify(model.table)}:{"model":${JSON.stringify(model.name)},` +
            `"columns":${JSON.stringify(columns)},"rows":[`,
        );

        let cursor: string | undefined;
        let count = 0;
        for (;;) {
          const page: Record<string, unknown>[] = await delegateOf(tx, model).findMany({
            take: PAGE_SIZE,
            orderBy: { id: 'asc' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (!page.length) break;
          const body = page.map((r) => JSON.stringify(toColumns(model, r))).join(',');
          await write((count ? ',' : '') + body);
          count += page.length;
          cursor = page[page.length - 1].id as string;
          if (page.length < PAGE_SIZE) break;
        }

        counts[model.table] = count;
        await write(`],"rowCount":${count}}`);
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30 * 60_000, maxWait: 60_000 },
  );

  await write(`},"totalRows":${Object.values(counts).reduce((a, b) => a + b, 0)}}`);
  return counts;
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export type RestoreMode = 'replace' | 'merge';

export type RestoreResult = {
  mode: RestoreMode;
  dryRun: boolean;
  tables: { table: string; inBackup: number; inserted: number; deleted: number }[];
  skippedTables: string[];
  droppedColumns: Record<string, string[]>;
  settingsRestored: boolean;
};

export class BackupValidationError extends Error {}

class DryRunRollback extends Error {
  constructor(public result: RestoreResult) {
    super('dry-run rollback');
  }
}

type BackupTable = { rows?: unknown };

export function validateBackup(backup: any): asserts backup is { tables: Record<string, BackupTable>; settings?: SystemSettings; version?: number } {
  if (!backup || typeof backup !== 'object') throw new BackupValidationError('Backup file is not a JSON object');
  if (backup.format !== BACKUP_FORMAT) {
    throw new BackupValidationError(`Not a SmartPOS backup (expected format "${BACKUP_FORMAT}")`);
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new BackupValidationError(`Unsupported backup version ${backup.version}; this server reads up to v${BACKUP_VERSION}`);
  }
  if (!backup.tables || typeof backup.tables !== 'object') {
    throw new BackupValidationError('Backup has no "tables" section');
  }
  for (const [table, value] of Object.entries(backup.tables)) {
    if (!value || !Array.isArray((value as BackupTable).rows)) {
      throw new BackupValidationError(`Table "${table}" has no rows array`);
    }
  }
}

function toPrismaRow(model: ModelInfo, row: Record<string, unknown>, dropped: Set<string>) {
  const known = new Set<string>();
  const data: Record<string, unknown> = {};

  for (const f of model.fields) {
    // Accept column names (our export) or Prisma field names (hand-made files).
    const key = f.column in row ? f.column : f.name in row ? f.name : null;
    if (key === null) continue;
    known.add(key);

    let value = row[key];
    if (value === null || value === undefined) {
      if (f.type === 'Json') value = Prisma.DbNull;
      else if (value === undefined) continue;
    } else if (f.type === 'DateTime') {
      value = new Date(value as string);
    }
    data[f.name] = value;
  }

  for (const key of Object.keys(row)) if (!known.has(key)) dropped.add(key);
  return data;
}

export async function restoreBackup(
  backup: unknown,
  opts: { mode: RestoreMode; dryRun?: boolean; onProgress?: (msg: string) => void },
): Promise<RestoreResult> {
  validateBackup(backup);
  const { mode, dryRun = false, onProgress = () => {} } = opts;
  const models = getModels();
  const tablesInBackup = backup.tables;

  const knownTables = new Set(models.flatMap((m) => [m.table, m.name]));
  const skippedTables = Object.keys(tablesInBackup).filter((t) => !knownTables.has(t));

  const run = async (tx: Prisma.TransactionClient): Promise<RestoreResult> => {
    const result: RestoreResult = {
      mode,
      dryRun,
      tables: models.map((m) => ({ table: m.table, inBackup: 0, inserted: 0, deleted: 0 })),
      skippedTables,
      droppedColumns: {},
      settingsRestored: false,
    };
    const stat = (m: ModelInfo) => result.tables.find((t) => t.table === m.table)!;

    if (mode === 'replace') {
      for (const model of [...models].reverse()) {
        const { count } = await delegateOf(tx, model).deleteMany({});
        stat(model).deleted = count;
        if (count) onProgress(`Cleared ${model.table} (${count})`);
      }
    }

    for (const model of models) {
      const rows = (tablesInBackup[model.table] ?? tablesInBackup[model.name])?.rows as
        | Record<string, unknown>[]
        | undefined;
      if (!rows?.length) continue;

      const dropped = new Set<string>();
      const data = rows.map((r) => toPrismaRow(model, r, dropped));
      if (dropped.size) result.droppedColumns[model.table] = [...dropped];

      let inserted = 0;
      for (let i = 0; i < data.length; i += INSERT_CHUNK) {
        try {
          const { count } = await delegateOf(tx, model).createMany({
            data: data.slice(i, i + INSERT_CHUNK),
            skipDuplicates: mode === 'merge',
          });
          inserted += count;
        } catch (err: any) {
          const detail = err?.meta?.target ? ` (${err.meta.target})` : '';
          throw new BackupValidationError(
            `Failed inserting into "${model.table}" near row ${i + 1}: ${err?.code || ''} ${
              err?.message?.split('\n').pop()?.trim() || 'insert error'
            }${detail}`,
          );
        }
      }
      stat(model).inBackup = rows.length;
      stat(model).inserted = inserted;
      onProgress(`Restored ${model.table}: ${inserted}/${rows.length}`);
    }

    if (dryRun) throw new DryRunRollback(result);
    return result;
  };

  let result: RestoreResult;
  try {
    const db = getLongTaskClient();
    await db.$queryRaw`SELECT 1`; // wake a paused Neon compute before the long transaction starts
    result = await db.$transaction(run as any, { timeout: 30 * 60_000, maxWait: 60_000 });
  } catch (err) {
    if (err instanceof DryRunRollback) return err.result;
    throw err;
  }

  if (backup.settings && typeof backup.settings === 'object') {
    setSystemSettings(backup.settings);
    result.settingsRestored = true;
  }
  return result;
}

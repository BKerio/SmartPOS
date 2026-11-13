/**
 * Restore a SmartPOS JSON backup into the database in DATABASE_URL.
 *
 * Migrating to a new PostgreSQL server:
 *   1. Point DATABASE_URL / DIRECT_URL in backend/.env at the new database
 *   2. npx prisma db push                      (creates the tables)
 *   3. npm run db:restore -- backup.json --mode=replace --yes
 *
 * Options:
 *   --mode=replace   wipe every table, then load the backup (default)
 *   --mode=merge     keep existing rows, add rows from the backup that don't exist yet
 *   --dry-run        run the whole restore inside a transaction, then roll it back
 *   --yes            required for a real replace (it deletes existing data)
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import fs from 'fs';
import prisma from '@/services/prisma';
import { restoreBackup, RestoreMode } from '@/services/backup';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const mode = (args.find((a) => a.startsWith('--mode='))?.split('=')[1] || 'replace') as RestoreMode;
  const dryRun = args.includes('--dry-run');

  if (!file) throw new Error('Usage: npm run db:restore -- <backup.json> [--mode=replace|merge] [--dry-run] [--yes]');
  if (mode !== 'replace' && mode !== 'merge') throw new Error('--mode must be replace or merge');
  if (mode === 'replace' && !dryRun && !args.includes('--yes')) {
    throw new Error('Replace mode deletes all existing data. Re-run with --yes to confirm (or use --dry-run first).');
  }

  const target = (process.env.DATABASE_URL || '').replace(/\/\/[^@]*@/, '//***@');
  console.log(`Target database: ${target}`);
  console.log(`Reading ${path.resolve(file)} ...`);
  const backup = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  console.log(`Backup exported ${backup.exportedAt}: mode=${mode}${dryRun ? ' (dry run)' : ''}\n`);

  const result = await restoreBackup(backup, { mode, dryRun, onProgress: (m) => console.log(`  ${m}`) });

  if (result.skippedTables.length) console.warn(`\nIgnored unknown tables: ${result.skippedTables.join(', ')}`);
  for (const [table, cols] of Object.entries(result.droppedColumns)) {
    console.warn(`Ignored unknown columns in ${table}: ${cols.join(', ')}`);
  }
  const inserted = result.tables.reduce((s, t) => s + t.inserted, 0);
  console.log(
    dryRun
      ? `\nDry run OK: ${inserted} rows would be inserted. Nothing was changed.`
      : `\nRestore complete: ${inserted} rows inserted.`,
  );
}

main()
  .catch((err) => {
    console.error('\nRestore failed (no changes were saved):', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

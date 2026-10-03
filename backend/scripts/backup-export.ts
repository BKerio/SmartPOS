/**
 * Export the whole database to a SmartPOS JSON backup.
 *
 *   npm run db:backup                         → backups/smartpos-backup-<timestamp>.json
 *   npm run db:backup -- path/to/file.json
 *
 * Uses DATABASE_URL from backend/.env.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import fs from 'fs';
import prisma from '@/services/prisma';
import { writeBackup } from '@/services/backup';

async function main() {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const outFile = path.resolve(process.argv[2] || path.join(__dirname, '..', 'backups', `smartpos-backup-${stamp}.json`));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const stream = fs.createWriteStream(outFile, 'utf8');
  const write = (chunk: string) =>
    new Promise<void>((resolve) => (stream.write(chunk) ? resolve() : stream.once('drain', resolve)));

  console.log(`Exporting database to ${outFile} ...`);
  const counts = await writeBackup(write, { name: 'CLI export' });
  await new Promise<void>((resolve, reject) => stream.end((err?: Error | null) => (err ? reject(err) : resolve())));

  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(24)} ${n}`);
  console.log(`\nDone — ${Object.values(counts).reduce((a, b) => a + b, 0)} rows.`);
}

main()
  .catch((err) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

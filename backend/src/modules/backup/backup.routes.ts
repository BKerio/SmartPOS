import { PassThrough } from 'stream';
import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import { ensureAdmin } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupValidationError,
  getTableCounts,
  restoreBackup,
  writeBackup,
} from '@/services/backup';

// Backups can be far larger than the app-wide JSON limit, so the import route raises it.
export const BACKUP_BODY_LIMIT = 512 * 1024 * 1024;

let restoreInProgress = false;

export default async function backupRoutes(app: App) {

  // ─── GET /api/admin/backup/summary ────────────────────────────────────────────
  app.get('/summary', { onRequest: ensureAdmin }, async (_req: Req, res: FastifyReply): Promise<any> => {
    try {
      const tables = await getTableCounts();
      return res.send({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        totalRows: tables.reduce((s, t) => s + t.rows, 0),
        tables,
      });
    } catch (error) {
      console.error('Backup summary error:', error);
      return res.status(500).send({ message: 'Failed to read table counts' });
    }
  });

  // ─── GET /api/admin/backup/export ─────────────────────────────────────────────
  app.get('/export', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    // Stream through Fastify (not reply.raw) so CORS and the other hook headers are still applied.
    const stream = new PassThrough();
    res
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="smartpos-backup-${stamp}.json"`)
      .header('Access-Control-Expose-Headers', 'Content-Disposition')
      .send(stream);

    // Respect backpressure so large tables don't pile up in memory.
    // Fastify destroys the stream if the client disconnects.
    const write = (chunk: string) =>
      new Promise<void>((resolve, reject) => {
        if (stream.destroyed) return reject(new Error('Client disconnected'));
        if (stream.write(chunk)) resolve();
        else stream.once('drain', resolve);
      });

    try {
      const counts = await writeBackup(write, {
        id: req.user?.id,
        name: req.user?.name,
        email: req.user?.email,
      });
      stream.end();

      await logAuditEvent({
        eventType: 'data_export',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        userEmail: req.user?.email,
        action: 'Download Data Backup',
        description: `Exported full database backup (${Object.values(counts).reduce((a, b) => a + b, 0)} rows)`,
        metadata: counts,
        ipAddress: req.ip,
      });
    } catch (error) {
      console.error('Backup export error:', error);
      // The download has already started; abort it so the client sees a failed (truncated) download, not a corrupt file.
      stream.destroy(error as Error);
    }
    return res;
  });

  // ─── POST /api/admin/backup/import ────────────────────────────────────────────
  // Body: { mode: 'replace' | 'merge', dryRun?: boolean, confirm?: 'RESTORE', backup: {...} }
  app.post('/import', { onRequest: ensureAdmin, bodyLimit: BACKUP_BODY_LIMIT }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { mode, dryRun, confirm, backup } = req.body ?? {};

    if (mode !== 'replace' && mode !== 'merge') {
      return res.status(422).send({ message: 'mode must be "replace" or "merge"' });
    }
    if (!dryRun && mode === 'replace' && confirm !== 'RESTORE') {
      return res.status(422).send({ message: 'Type RESTORE to confirm replacing all existing data' });
    }
    if (restoreInProgress) {
      return res.status(409).send({ message: 'A restore is already running' });
    }

    restoreInProgress = true;
    try {
      const result = await restoreBackup(backup, { mode, dryRun: Boolean(dryRun) });

      if (!result.dryRun) {
        const inserted = result.tables.reduce((s, t) => s + t.inserted, 0);
        await logAuditEvent({
          eventType: 'data_import',
          userType: 'admin',
          userId: req.user?.id,
          userName: req.user?.name || 'Admin',
          userEmail: req.user?.email,
          action: mode === 'replace' ? 'Restore Data Backup (replace)' : 'Import Data Backup (merge)',
          description: `${mode === 'replace' ? 'Replaced database from' : 'Merged'} backup exported ${
          backup?.exportedAt || 'unknown date'
        } — ${inserted} rows inserted`,
          metadata: { mode, exportedAt: backup?.exportedAt, tables: result.tables },
          ipAddress: req.ip,
        });
      }

      return res.send(result);
    } catch (error: any) {
      if (error instanceof BackupValidationError) {
        return res.status(422).send({ message: error.message });
      }
      console.error('Backup import error:', error);
      return res.status(500).send({ message: error?.message || 'Restore failed — no changes were saved' });
    } finally {
      restoreInProgress = false;
    }
  });
}

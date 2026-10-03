import express, { Router, Request, Response } from 'express';
import { ensureAdmin } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupValidationError,
  getTableCounts,
  restoreBackup,
  writeBackup,
} from '@/services/backup';

const router = Router();

// Backups can be far larger than the app-wide JSON limit; index.ts skips its parser for this router.
export const BACKUP_BODY_LIMIT = '512mb';

let restoreInProgress = false;

// ─── GET /api/admin/backup/summary ────────────────────────────────────────────
router.get('/summary', ensureAdmin, async (_req: Request, res: Response): Promise<any> => {
  try {
    const tables = await getTableCounts();
    return res.json({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      totalRows: tables.reduce((s, t) => s + t.rows, 0),
      tables,
    });
  } catch (error) {
    console.error('Backup summary error:', error);
    return res.status(500).json({ message: 'Failed to read table counts' });
  }
});

// ─── GET /api/admin/backup/export ─────────────────────────────────────────────
router.get('/export', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="smartpos-backup-${stamp}.json"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  // Respect backpressure so large tables don't pile up in memory.
  const write = (chunk: string) =>
    new Promise<void>((resolve, reject) => {
      if (res.destroyed) return reject(new Error('Client disconnected'));
      if (res.write(chunk)) resolve();
      else res.once('drain', resolve);
    });

  try {
    const counts = await writeBackup(write, {
      id: req.user?.id,
      name: req.user?.name,
      email: req.user?.email,
    });
    res.end();

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
    // Headers are already sent; abort so the client sees a failed (truncated) download, not a corrupt file.
    if (!res.headersSent) return res.status(500).json({ message: 'Backup export failed' });
    res.destroy(error as Error);
  }
});

// ─── POST /api/admin/backup/import ────────────────────────────────────────────
// Body: { mode: 'replace' | 'merge', dryRun?: boolean, confirm?: 'RESTORE', backup: {...} }
router.post(
  '/import',
  ensureAdmin,
  express.json({ limit: BACKUP_BODY_LIMIT }),
  async (req: Request, res: Response): Promise<any> => {
    const { mode, dryRun, confirm, backup } = req.body ?? {};

    if (mode !== 'replace' && mode !== 'merge') {
      return res.status(422).json({ message: 'mode must be "replace" or "merge"' });
    }
    if (!dryRun && mode === 'replace' && confirm !== 'RESTORE') {
      return res.status(422).json({ message: 'Type RESTORE to confirm replacing all existing data' });
    }
    if (restoreInProgress) {
      return res.status(409).json({ message: 'A restore is already running' });
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

      return res.json(result);
    } catch (error: any) {
      if (error instanceof BackupValidationError) {
        return res.status(422).json({ message: error.message });
      }
      console.error('Backup import error:', error);
      return res.status(500).json({ message: error?.message || 'Restore failed — no changes were saved' });
    } finally {
      restoreInProgress = false;
    }
  },
);

export default router;

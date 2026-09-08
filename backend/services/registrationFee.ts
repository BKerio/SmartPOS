import prisma from '@/services/prisma';
import type { Prisma } from '@prisma/client';

export const REGISTRATION_FEE_KES = 500;
export const REGISTRATION_FEE_REF = 'SYSTEM_REGISTRATION';
export const REGISTRATION_FEE_TYPE = 'registration_fee';
export const REGISTRATION_FEE_DESCRIPTION = 'System registration fee';

type DbClient = Prisma.TransactionClient | typeof prisma;

async function findExistingFee(studentId: string, db: DbClient) {
  return db.walletTransaction.findFirst({
    where: {
      studentId,
      OR: [
        { reference: REGISTRATION_FEE_REF },
        { type: REGISTRATION_FEE_TYPE },
      ],
    },
  });
}

/**
 * Idempotently deduct the system registration fee and record it in wallet history.
 * Allows the wallet to go negative so the fee always posts.
 */
export async function ensureSystemRegistrationFee(studentId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await findExistingFee(studentId, tx);
    if (existing) {
      return { applied: false as const, transaction: existing };
    }

    const student = await tx.student.update({
      where: { id: studentId },
      data: { walletBalance: { decrement: REGISTRATION_FEE_KES } },
      select: { id: true, name: true, regNo: true, walletBalance: true },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        studentId,
        amount: -REGISTRATION_FEE_KES,
        type: REGISTRATION_FEE_TYPE,
        reference: REGISTRATION_FEE_REF,
        description: REGISTRATION_FEE_DESCRIPTION,
      },
    });

    return { applied: true as const, student, transaction };
  });
}

/** Students that still need the system registration fee deducted. */
export async function findStudentsMissingRegistrationFee() {
  const students = await prisma.student.findMany({
    select: { id: true, name: true, regNo: true, walletBalance: true },
    orderBy: { createdAt: 'desc' },
  });

  const feeRows = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { reference: REGISTRATION_FEE_REF },
        { type: REGISTRATION_FEE_TYPE },
      ],
    },
    select: { studentId: true },
  });
  const hasFee = new Set(feeRows.map((t) => t.studentId));

  return students.filter((s) => !hasFee.has(s.id));
}

/**
 * Sync walletBalance to the sum of wallet transactions in one SQL pass.
 * Fixes fee ledger rows that were recorded without updating the balance.
 */
export async function reconcileWalletBalancesFromLedger() {
  const synced = await prisma.$executeRaw`
    UPDATE students AS s
    SET "walletBalance" = t.ledger
    FROM (
      SELECT "studentId" AS sid, COALESCE(SUM(amount), 0)::double precision AS ledger
      FROM wallet_transactions
      GROUP BY "studentId"
    ) t
    WHERE s.id = t.sid
      AND ABS(s."walletBalance" - t.ledger) > 0.005
  `;

  return { synced: Number(synced) };
}

/**
 * Apply missing registration fees for every student, then reconcile wallet
 * balances to the transaction ledger so the KES 500 cut shows everywhere.
 */
export async function backfillMissingRegistrationFees() {
  const missing = await findStudentsMissingRegistrationFee();
  const totalStudents = await prisma.student.count();

  let applied = 0;
  let failed = 0;
  const errors: string[] = [];

  // Sequential to avoid connection pool exhaustion (limit often 1 via PgBouncer).
  for (const s of missing) {
    try {
      const result = await ensureSystemRegistrationFee(s.id);
      if (result.applied) applied += 1;
    } catch (err: any) {
      failed += 1;
      errors.push(`${s.id}: ${err?.message || String(err)}`);
    }
  }

  const reconcile = await reconcileWalletBalancesFromLedger();
  const stillMissing = await findStudentsMissingRegistrationFee();

  return {
    applied,
    failed,
    total: totalStudents,
    missingBefore: missing.length,
    missingAfter: stillMissing.length,
    skipped: totalStudents - applied - stillMissing.length,
    balancesSynced: reconcile.synced,
    errors: errors.slice(0, 20),
  };
}

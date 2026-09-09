import prisma from '@/services/prisma';
import type { Prisma } from '@prisma/client';

export const REGISTRATION_FEE_KES = 500;
export const REGISTRATION_FEE_REF = 'SYSTEM_REGISTRATION';
export const REGISTRATION_FEE_TYPE = 'registration_fee';
export const REGISTRATION_FEE_DESCRIPTION = 'System registration fee';

/**
 * Registration fee applies only to students onboarded on/after this local date
 * (Africa/Nairobi). Older students must not be charged.
 */
export const REGISTRATION_FEE_EFFECTIVE_FROM = new Date('2026-09-08T00:00:00+03:00');

type DbClient = Prisma.TransactionClient | typeof prisma;

export function isRegistrationFeeEligible(createdAt?: string | Date | null): boolean {
  if (!createdAt) return false;
  return new Date(createdAt).getTime() >= REGISTRATION_FEE_EFFECTIVE_FROM.getTime();
}

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
 * Idempotently deduct the system registration fee for eligible (new) students only.
 */
export async function ensureSystemRegistrationFee(studentId: string) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, regNo: true, walletBalance: true, createdAt: true },
    });
    if (!student) {
      return { applied: false as const, skipped: 'not_found' as const };
    }
    if (!isRegistrationFeeEligible(student.createdAt)) {
      return { applied: false as const, skipped: 'not_eligible' as const };
    }

    const existing = await findExistingFee(studentId, tx);
    if (existing) {
      return { applied: false as const, transaction: existing, skipped: 'already_applied' as const };
    }

    const updated = await tx.student.update({
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

    return { applied: true as const, student: updated, transaction };
  });
}

/**
 * Remove incorrectly applied registration fees from students onboarded before the cutoff,
 * and credit KES 500 back to their wallets.
 */
export async function reverseIneligibleRegistrationFees() {
  const feeRows = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { reference: REGISTRATION_FEE_REF },
        { type: REGISTRATION_FEE_TYPE },
      ],
      amount: { lt: 0 },
    },
    select: {
      id: true,
      studentId: true,
      amount: true,
      student: { select: { id: true, createdAt: true } },
    },
  });

  let reversed = 0;
  for (const row of feeRows) {
    if (isRegistrationFeeEligible(row.student.createdAt)) continue;

    await prisma.$transaction(async (tx) => {
      await tx.walletTransaction.delete({ where: { id: row.id } });
      await tx.student.update({
        where: { id: row.studentId },
        data: { walletBalance: { increment: Math.abs(Number(row.amount) || REGISTRATION_FEE_KES) } },
      });
    });
    reversed += 1;
  }

  return { reversed, scanned: feeRows.length };
}

/** Eligible students that still need the system registration fee deducted. */
export async function findStudentsMissingRegistrationFee() {
  const students = await prisma.student.findMany({
    where: { createdAt: { gte: REGISTRATION_FEE_EFFECTIVE_FROM } },
    select: { id: true, name: true, regNo: true, walletBalance: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const feeRows = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { reference: REGISTRATION_FEE_REF },
        { type: REGISTRATION_FEE_TYPE },
      ],
      studentId: { in: students.map((s) => s.id) },
    },
    select: { studentId: true },
  });
  const hasFee = new Set(feeRows.map((t) => t.studentId));

  return students.filter((s) => !hasFee.has(s.id));
}

/**
 * Sync walletBalance to the sum of wallet transactions in one SQL pass.
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
 * 1) Reverse fees wrongly charged to students before the cutoff
 * 2) Apply missing fees only to eligible (new) students
 * 3) Reconcile wallet balances to the ledger
 */
export async function backfillMissingRegistrationFees() {
  const reversed = await reverseIneligibleRegistrationFees();
  const missing = await findStudentsMissingRegistrationFee();
  const eligibleTotal = await prisma.student.count({
    where: { createdAt: { gte: REGISTRATION_FEE_EFFECTIVE_FROM } },
  });
  const totalStudents = await prisma.student.count();

  let applied = 0;
  let failed = 0;
  const errors: string[] = [];

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
    reversed: reversed.reversed,
    total: totalStudents,
    eligibleTotal,
    missingBefore: missing.length,
    missingAfter: stillMissing.length,
    skipped: eligibleTotal - applied - stillMissing.length,
    balancesSynced: reconcile.synced,
    effectiveFrom: REGISTRATION_FEE_EFFECTIVE_FROM.toISOString(),
    errors: errors.slice(0, 20),
  };
}

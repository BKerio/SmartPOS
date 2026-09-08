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

/** Apply missing registration fees for all students that do not have one yet. */
export async function backfillMissingRegistrationFees() {
  const students = await prisma.student.findMany({ select: { id: true } });
  const already = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { reference: REGISTRATION_FEE_REF },
        { type: REGISTRATION_FEE_TYPE },
      ],
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const hasFee = new Set(already.map((t) => t.studentId));

  let applied = 0;
  for (const s of students) {
    if (hasFee.has(s.id)) continue;
    const result = await ensureSystemRegistrationFee(s.id);
    if (result.applied) applied += 1;
  }

  return { applied, total: students.length, skipped: students.length - applied };
}

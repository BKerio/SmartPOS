/**
 * One-shot: deduct KES 500 system registration fee from every student missing it,
 * then sync all wallet balances to the transaction ledger.
 *
 * Usage (from backend/):
 *   npx tsx scripts/apply-registration-fees.ts
 */
import 'dotenv/config';
import {
  backfillMissingRegistrationFees,
  REGISTRATION_FEE_DESCRIPTION,
  REGISTRATION_FEE_KES,
} from '../services/registrationFee';
import prisma from '../services/prisma';

async function main() {
  console.log(
    `Applying ${REGISTRATION_FEE_DESCRIPTION} (KES ${REGISTRATION_FEE_KES}) across all students + reconciling wallets...`,
  );
  const result = await backfillMissingRegistrationFees();
  console.log(JSON.stringify(result, null, 2));
  if (result.missingAfter > 0) {
    console.error(`WARNING: ${result.missingAfter} student(s) still missing the fee`);
    process.exitCode = 1;
  } else {
    console.log(
      `Done. Fees applied: ${result.applied}. Wallet balances synced: ${result.balancesSynced}.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

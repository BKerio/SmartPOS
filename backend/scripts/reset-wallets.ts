import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function resetWallets() {
  console.log('🔄 Clearing simulated wallet data...\n');

  // 1. Delete all M-Pesa payment records
  const mpesaDeleted = await prisma.mpesaPayment.deleteMany({});
  console.log(`Deleted ${mpesaDeleted.count} M-Pesa payment record(s)`);

  // 2. Delete all wallet transactions
  const txDeleted = await prisma.walletTransaction.deleteMany({});
  console.log(`Deleted ${txDeleted.count} wallet transaction(s)`);

  // 3. Reset all student wallet balances to 0
  const studentsReset = await prisma.student.updateMany({
    data: { walletBalance: 0 },
  });
  console.log(`Reset wallet balance to KES 0 for ${studentsReset.count} student(s)`);

  console.log('\nDone! All simulated data has been cleared.');
  await prisma.$disconnect();
}

resetWallets().catch((err) => {
  console.error('Reset failed:', err);
  prisma.$disconnect();
  process.exit(1);
});

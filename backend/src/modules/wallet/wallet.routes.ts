import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import prisma from '@/services/prisma';
import { ensureAuthenticated, ensureFinanceOrAdmin } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';

type WalletDirection = 'credit' | 'debit';

async function applyWalletAdjustment(opts: {
  studentId: string;
  amount: number;
  direction: WalletDirection;
  reference?: string;
  description?: string;
}) {
  const { studentId, amount, direction, reference, description } = opts;
  const signedAmount = direction === 'credit' ? amount : -amount;
  const txType = direction === 'credit' ? 'deposit' : 'adjustment';
  const defaultDescription =
    direction === 'credit' ? 'Wallet top-up' : 'Wallet adjustment (debit)';

  return prisma.$transaction(async (tx) => {
    const existing = await tx.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, regNo: true, walletBalance: true },
    });
    if (!existing) return { error: 'not_found' as const };

    if (direction === 'debit' && existing.walletBalance < amount) {
      return { error: 'insufficient_balance' as const, student: existing };
    }

    const student = await tx.student.update({
      where: { id: studentId },
      data: { walletBalance: { increment: signedAmount } },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        studentId,
        amount: signedAmount,
        type: txType,
        reference,
        description: description || defaultDescription,
      },
    });

    return { student, transaction, previousBalance: existing.walletBalance };
  });
}

export default async function walletRoutes(app: App) {

  // ─── GET /api/wallet/balance ──────────────────────────────────────────────────
  app.get('/balance', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const student = await prisma.student.findUnique({
        where: { id: req.user!.id },
        select: { walletBalance: true },
      });

      if (!student) return res.status(404).send({ message: 'Student not found' });

      return res.send({ balance: student.walletBalance });
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/wallet/history ──────────────────────────────────────────────────
  app.get('/history', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const transactions = await prisma.walletTransaction.findMany({
        where: { studentId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return res.send(transactions);
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/wallet/history/:studentId ───────────────────────────────────────
  app.get('/history/:studentId', { onRequest: ensureFinanceOrAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const student = await prisma.student.findUnique({
        where: { id: req.params.studentId as string },
        select: { id: true, name: true, regNo: true, walletBalance: true },
      });
      if (!student) return res.status(404).send({ message: 'Student not found' });

      const transactions = await prisma.walletTransaction.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return res.send({ student, transactions });
    } catch {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── POST /api/wallet/adjust ──────────────────────────────────────────────────
  app.post('/adjust', { onRequest: ensureFinanceOrAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { studentId, amount, direction, reference, description } = req.body;
    const adjustAmount = Number(amount);
    const adjustDirection: WalletDirection = direction === 'debit' ? 'debit' : 'credit';

    if (!studentId || isNaN(adjustAmount) || adjustAmount <= 0) {
      return res.status(422).send({ message: 'Valid student ID and positive amount are required' });
    }

    try {
      const result = await applyWalletAdjustment({
        studentId,
        amount: adjustAmount,
        direction: adjustDirection,
        reference,
        description,
      });

      if ('error' in result) {
        if (result.error === 'not_found') {
          return res.status(404).send({ message: 'Student not found' });
        }
        return res.status(422).send({
          message: `Insufficient balance. Current balance is KES ${result.student.walletBalance}`,
        });
      }

      const { student, transaction, previousBalance } = result;
      const verb = adjustDirection === 'credit' ? 'Credited' : 'Debited';

      await logAuditEvent({
        eventType: adjustDirection === 'credit' ? 'wallet_deposit' : 'wallet_debit',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: adjustDirection === 'credit' ? 'Wallet Deposit' : 'Wallet Debit',
        description: `${verb} KES ${adjustAmount} ${adjustDirection === 'credit' ? 'to' : 'from'} student ${student.regNo}`,
        metadata: {
          studentId,
          amount: adjustAmount,
          direction: adjustDirection,
          previousBalance,
          transactionId: transaction.id,
        },
        ipAddress: req.ip,
      });

      return res.send({
        message: `${verb} successfully`,
        previousBalance,
        newBalance: student.walletBalance,
        transaction,
      });
    } catch (error) {
      console.error('Wallet adjust error:', error);
      return res.status(500).send({ message: 'Wallet update failed' });
    }
  });

  // ─── POST /api/wallet/deposit ─────────────────────────────────────────────────
  app.post('/deposit', { onRequest: ensureFinanceOrAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { studentId, amount, reference, description } = req.body;
    const depositAmount = Number(amount);

    if (!studentId || isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(422).send({ message: 'Valid student ID and positive amount are required' });
    }

    try {
      const result = await applyWalletAdjustment({
        studentId,
        amount: depositAmount,
        direction: 'credit',
        reference,
        description: description || 'Wallet Top-up',
      });

      if ('error' in result) {
        return res.status(404).send({ message: 'Student not found' });
      }

      const { student, transaction } = result;

      await logAuditEvent({
        eventType: 'wallet_deposit',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Wallet Deposit',
        description: `Deposited KES ${depositAmount} to student ${student.regNo}`,
        metadata: { studentId, amount: depositAmount, transactionId: transaction.id },
        ipAddress: req.ip,
      });

      return res.send({
        message: 'Deposit successful',
        newBalance: student.walletBalance,
        transaction,
      });
    } catch (error) {
      console.error('Deposit error:', error);
      return res.status(500).send({ message: 'Deposit failed' });
    }
  });
}

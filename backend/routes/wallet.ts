import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated, ensureAdmin } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

// ─── GET /api/wallet/balance ──────────────────────────────────────────────────
router.get('/balance', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.user!.id },
      select: { walletBalance: true },
    });

    if (!student) return res.status(404).json({ message: 'Student not found' });

    return res.json({ balance: student.walletBalance });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/wallet/history ──────────────────────────────────────────────────
router.get('/history', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const transactions = await prisma.walletTransaction.findMany({
      where: { studentId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json(transactions);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/wallet/deposit ─────────────────────────────────────────────────
// Allows finance officers or admins to deposit funds into a student's wallet
router.post('/deposit', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  const { studentId, amount, reference, description } = req.body;

  // Only finance, admin, or parents should be able to deposit
  if (!['admin', 'finance', 'parent'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized to perform deposits' });
  }

  const depositAmount = Number(amount);
  if (!studentId || isNaN(depositAmount) || depositAmount <= 0) {
    return res.status(422).json({ message: 'Valid student ID and positive amount are required' });
  }

  try {
    if (req.user!.role === 'parent') {
      const linked = await prisma.student.findFirst({
        where: { id: studentId, parentId: req.user!.id },
        select: { id: true },
      });
      if (!linked) {
        return res.status(403).json({ message: 'You can only top up wallets for your linked students' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.update({
        where: { id: studentId },
        data: { walletBalance: { increment: depositAmount } },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          studentId,
          amount: depositAmount,
          type: 'deposit',
          reference,
          description: description || 'Wallet Top-up',
        },
      });

      return { student, transaction };
    });

    await logAuditEvent({
      eventType: 'wallet_deposit',
      userType: req.user!.role,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Wallet Deposit',
      description: `Deposited KES ${depositAmount} to student ${result.student.regNo}`,
      metadata: { studentId, amount: depositAmount, transactionId: result.transaction.id },
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Deposit successful',
      newBalance: result.student.walletBalance,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error('Deposit error:', error);
    return res.status(500).json({ message: 'Deposit failed' });
  }
});

export default router;

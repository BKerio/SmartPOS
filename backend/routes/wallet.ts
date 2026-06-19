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

// ─── POST /api/wallet/topup ───────────────────────────────────────────────────
// Simulated M-Pesa top-up for students (credits wallet after phone + amount validation)
router.post('/topup', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'student') {
    return res.status(403).json({ message: 'Only students can top up their own wallet' });
  }

  const { phone, amount, reference } = req.body;
  const topupAmount = Number(amount);
  if (!phone || isNaN(topupAmount) || topupAmount <= 0) {
    return res.status(422).json({ message: 'Valid phone and positive amount are required' });
  }
  if (!/^(01|07)\d{8}$/.test(phone) && !/^254\d{9}$/.test(phone)) {
    return res.status(422).json({ message: 'Enter a valid Kenyan phone number' });
  }

  const studentId = req.user!.id;
  const mpesaRef = reference || `MPESA-${Date.now()}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.update({
        where: { id: studentId },
        data: { walletBalance: { increment: topupAmount } },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          studentId,
          amount: topupAmount,
          type: 'deposit',
          reference: mpesaRef,
          description: `M-Pesa top-up from ${phone}`,
        },
      });

      return { student, transaction };
    });

    await logAuditEvent({
      eventType: 'wallet_topup',
      userType: 'student',
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Wallet Top-up',
      description: `Student topped up KES ${topupAmount} via M-Pesa`,
      metadata: { amount: topupAmount, reference: mpesaRef, phone },
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Top-up successful',
      newBalance: result.student.walletBalance,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error('Top-up error:', error);
    return res.status(500).json({ message: 'Top-up failed' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

type DateFilter = { gte?: Date; lte?: Date };

function parseDateFilter(startDate?: string, endDate?: string): DateFilter | null {
  const filter: DateFilter = {};
  if (startDate) {
    const d = new Date(startDate);
    if (Number.isNaN(d.getTime())) return null;
    filter.gte = d;
  }
  if (endDate) {
    const d = new Date(endDate);
    if (Number.isNaN(d.getTime())) return null;
    // include entire end date day
    d.setHours(23, 59, 59, 999);
    filter.lte = d;
  }
  return filter;
}

// ─── GET /api/finance/summary ─────────────────────────────────────────────────
// Aggregates total POS sales (Revenue) and total Expenses
router.get('/summary', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { startDate, endDate } = req.query as Record<string, string>;
  const dateFilter = parseDateFilter(startDate, endDate);
  if (dateFilter === null) return res.status(422).json({ message: 'Invalid date range' });

  try {
    const useDate = dateFilter && Object.keys(dateFilter).length > 0;
    const posFilter = useDate ? { createdAt: dateFilter, status: 'completed' } : { status: 'completed' };
    const expenseFilter = useDate ? { date: dateFilter } : {};

    const [posAggr, expenseAggr] = await Promise.all([
      prisma.posTransaction.aggregate({ _sum: { totalAmount: true }, where: posFilter }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: expenseFilter }),
    ]);

    const revenue = posAggr._sum.totalAmount || 0;
    const expenses = expenseAggr._sum.amount || 0;
    const netProfit = revenue - expenses;

    return res.json({
      revenue,
      expenses,
      netProfit,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/finance/collections ─────────────────────────────────────────────
// Wallet movements report: deposits (+) and purchases (-)
router.get('/collections', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { startDate, endDate } = req.query as Record<string, string>;
  const dateFilter = parseDateFilter(startDate, endDate);
  if (dateFilter === null) return res.status(422).json({ message: 'Invalid date range' });

  const where =
    dateFilter && Object.keys(dateFilter).length > 0
      ? { createdAt: dateFilter }
      : undefined;

  try {
    const txs = await prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: {
        student: { select: { name: true, regNo: true } },
      },
    });

    // Map deposit reference -> mpesa phone (from KopoPayment)
    const refs = Array.from(
      new Set(
        txs
          .filter((t) => t.type === 'deposit' && t.reference)
          .map((t) => String(t.reference)),
      ),
    );

    const kopoByRef = new Map<string, { phone: string }>();
    if (refs.length > 0) {
      const kopos = await prisma.kopoPayment.findMany({
        where: {
          OR: [{ transactionReference: { in: refs } }, { reference: { in: refs } }],
        },
        select: { transactionReference: true, reference: true, phone: true },
        take: refs.length,
      });
      for (const k of kopos) {
        if (k.transactionReference) kopoByRef.set(k.transactionReference, { phone: k.phone });
        if (k.reference) kopoByRef.set(k.reference, { phone: k.phone });
      }
    }

    const rows = txs.map((t) => {
      const ref = t.reference ? String(t.reference) : '';
      const mpesa = t.type === 'deposit' ? (kopoByRef.get(ref)?.phone || '') : '';
      const method =
        t.type === 'deposit'
          ? 'M-Pesa via KopoKopo'
          : t.type === 'purchase'
            ? 'Wallet'
            : t.type === 'refund'
              ? 'Refund'
              : t.type || 'Wallet';

      return {
        mpesaNumber: mpesa,
        date: t.createdAt,
        name: t.student?.name || '',
        admNo: t.student?.regNo || '',
        method,
        amount: t.amount, // + topup, - usage
        type: t.type,
      };
    });

    return res.json(rows);
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/finance/expenses ────────────────────────────────────────────────
router.get('/expenses', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const expenses = await prisma.expense.findMany({ orderBy: { date: 'desc' }, take: 100 });
    return res.json(expenses);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/finance/expenses ───────────────────────────────────────────────
router.post('/expenses', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { category, amount, description, date } = req.body;
  if (!category || !amount || !description) {
    return res.status(422).json({ message: 'Category, amount, and description are required' });
  }

  try {
    const expense = await prisma.expense.create({
      data: {
        category,
        amount: Number(amount),
        description,
        date: date ? new Date(date) : new Date(),
        recordedBy: req.user!.id,
      },
    });

    await logAuditEvent({
      eventType: 'expense_recorded',
      userType: req.user!.role,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Record Expense',
      description: `Recorded expense of KES ${amount} for ${category} (${description})`,
      ipAddress: req.ip,
    });

    return res.status(201).json(expense);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

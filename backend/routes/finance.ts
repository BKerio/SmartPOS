import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

// ─── GET /api/finance/summary ─────────────────────────────────────────────────
// Aggregates total POS sales (Revenue) and total Expenses
router.get('/summary', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { startDate, endDate } = req.query as Record<string, string>;
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));

  try {
    const posFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter, status: 'completed' } : { status: 'completed' };
    const expenseFilter = Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {};

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

import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

type DateFilter = { gte?: Date; lte?: Date };

const KOPO_SUCCESS = new Set(['success', 'received', 'complete', 'completed', 'paid']);

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

function kopoMetadataFromRaw(rawPayload: unknown): Record<string, string> {
  if (!rawPayload || typeof rawPayload !== 'object') return {};
  const data = (rawPayload as any)?.data ?? rawPayload;
  const attrs = (data as any)?.attributes ?? {};
  const meta = attrs?.metadata ?? {};
  const event = attrs?.event ?? (data as any)?.event ?? {};
  const resource = event?.resource ?? {};

  const senderFirst = String(resource.sender_first_name ?? '').trim();
  const senderMiddle = String(resource.sender_middle_name ?? '').trim();
  const senderLast = String(resource.sender_last_name ?? '').trim();
  const senderName = [senderFirst, senderMiddle, senderLast].filter(Boolean).join(' ');
  const senderPhone = String(resource.sender_phone_number ?? '').trim();

  return {
    description: String(meta.description ?? ''),
    student_reg_no: String(meta.student_reg_no ?? meta.studentRegNo ?? meta.reg_no ?? ''),
    student_name: String(meta.student_name ?? meta.studentName ?? ''),
    payer_name: String(meta.payer_name ?? meta.payerName ?? senderName ?? ''),
    payer_phone: String(meta.payer_phone ?? meta.payerPhone ?? senderPhone ?? ''),
    purpose: String(meta.purpose ?? ''),
    payer_type: String(meta.payer_type ?? meta.payerType ?? ''),
    status: String(attrs.status ?? ''),
    error: String(event.errors ?? event.error ?? ''),
  };
}

function isGuestTillPayment(purpose: string, studentId: string | null | undefined, meta: Record<string, string>): boolean {
  if (purpose === 'pos_sale' && !studentId) return true;
  return meta.payer_type === 'guest' || meta.student_name?.toLowerCase() === 'guest';
}

function tillPaymentReceived(status: string, amount: number): boolean {
  return KOPO_SUCCESS.has((status || '').toLowerCase()) && amount > 0;
}

function kopoSettlementNote(
  purpose: string,
  success: boolean,
  walletCredited: boolean,
  posCompleted: boolean,
): string {
  if (!success) return 'not received';
  if (purpose === 'wallet_topup') return walletCredited ? 'wallet credited' : 'till received · wallet pending';
  if (purpose === 'pos_sale') return posCompleted ? 'pos sale completed' : 'till received · pos pending';
  return 'till received';
}

function formatKopoMetadata(
  description: string,
  meta: Record<string, string>,
  extras?: { guest?: boolean; purpose?: string },
): string {
  const parts: string[] = [];
  if (extras?.guest) parts.push('Guest');
  if (meta.description) parts.push(meta.description);
  if (meta.student_reg_no && meta.student_reg_no !== 'GUEST') parts.push(`Adm: ${meta.student_reg_no}`);
  const purpose = extras?.purpose || meta.purpose;
  if (purpose) parts.push(`Purpose: ${purpose}`);
  if (meta.error) parts.push(meta.error);
  if (meta.status && meta.status.toLowerCase() !== 'success') parts.push(`Status: ${meta.status}`);
  if (parts.length > 0) return parts.join(' · ');
  return description || '-';
}

function kopoMethod(purpose: string, guest = false): string {
  if (purpose === 'pos_sale') return guest ? 'M-Pesa Till (Guest POS)' : 'M-Pesa Till (POS)';
  if (purpose === 'wallet_topup') return 'M-Pesa Till (Wallet Top-up)';
  return 'M-Pesa Till';
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
// Till M-Pesa payments (all statuses) + wallet top-ups/deposits + wallet usage
router.get('/collections', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { startDate, endDate } = req.query as Record<string, string>;
  const dateFilter = parseDateFilter(startDate, endDate);
  if (dateFilter === null) return res.status(422).json({ message: 'Invalid date range' });

  const createdAt =
    dateFilter && Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

  try {
    const [kopos, purchases, deposits, guestPosSales] = await Promise.all([
      prisma.kopoPayment.findMany({
        where: createdAt ? { createdAt } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      prisma.walletTransaction.findMany({
        where: {
          ...(createdAt ? { createdAt } : {}),
          type: { in: ['purchase', 'refund'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        include: {
          student: { select: { name: true, regNo: true } },
        },
      }),
      prisma.walletTransaction.findMany({
        where: {
          ...(createdAt ? { createdAt } : {}),
          type: 'deposit',
          NOT: { description: { contains: 'KopoKopo', mode: 'insensitive' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        include: {
          student: { select: { name: true, regNo: true } },
        },
      }),
      prisma.posTransaction.findMany({
        where: {
          paymentMethod: { in: ['mpesa', 'cash'] },
          studentId: null,
          status: 'completed',
          ...(createdAt ? { createdAt } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        include: {
          items: { include: { menuItem: { select: { name: true } } } },
        },
      }),
    ]);

    const linkedPosIds = new Set(
      kopos.map((k) => k.posTransactionId).filter(Boolean) as string[],
    );

    const studentIds = [
      ...new Set(kopos.map((k) => k.studentId).filter(Boolean) as string[]),
    ];
    const students =
      studentIds.length > 0
        ? await prisma.student.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, name: true, regNo: true },
          })
        : [];
    const studentById = new Map(students.map((s) => [s.id, s]));

    const kopoRows = kopos.map((k) => {
      const student = k.studentId ? studentById.get(k.studentId) : undefined;
      const meta = kopoMetadataFromRaw(k.rawPayload);
      const purpose = k.purpose || meta.purpose || 'general';
      const guest = isGuestTillPayment(purpose, k.studentId, meta);
      const success = KOPO_SUCCESS.has((k.status || '').toLowerCase());
      const receivedOnTill = tillPaymentReceived(k.status, k.amount);
      const payerName = meta.payer_name || '';
      const payerPhone = meta.payer_phone || '';

      const payload = {
        source: 'kopo',
        paymentId: k.id,
        status: k.status,
        purpose,
        guest,
        amount: k.amount,
        currency: k.currency,
        phone: k.phone,
        description: k.description,
        tillNumber: k.tillNumber,
        transactionReference: k.transactionReference,
        reference: k.reference,
        location: k.location,
        studentId: k.studentId,
        studentName: guest ? 'Guest' : student?.name || meta.student_name || null,
        studentRegNo: guest ? k.phone || 'GUEST' : student?.regNo || meta.student_reg_no || null,
        payerName: payerName || null,
        payerPhone: payerPhone || null,
        walletCredited: k.walletCredited,
        posCompleted: k.posCompleted,
        posTransactionId: k.posTransactionId,
        posCart: k.posCart,
        payerUserId: k.payerUserId,
        payerRole: k.payerRole,
        tillReceived: receivedOnTill,
        settlement: kopoSettlementNote(purpose, success, k.walletCredited, k.posCompleted),
        createdAt: k.createdAt,
        originationTime: k.originationTime,
        metadata: {
          description: meta.description || k.description,
          student_id: k.studentId || '',
          student_reg_no: guest ? 'GUEST' : student?.regNo || meta.student_reg_no || '',
          student_name: guest ? 'Guest' : student?.name || meta.student_name || '',
          payer_name: payerName,
          payer_phone: payerPhone,
          purpose,
          payer_type: guest ? 'guest' : meta.payer_type || 'student',
          ...(meta.error ? { error: meta.error } : {}),
        },
        kopokopo: k.rawPayload ?? null,
      };

      return {
        id: k.id,
        source: 'kopo',
        mpesaNumber: k.phone || payerPhone || '',
        date: k.createdAt,
        name: guest ? 'Guest' : student?.name || meta.student_name || payerName || '',
        admNo: guest ? k.phone || 'GUEST' : student?.regNo || meta.student_reg_no || '',
        method: kopoMethod(purpose, guest),
        amount: receivedOnTill ? k.amount : 0,
        attemptedAmount: k.amount,
        status: k.status,
        type: purpose,
        metadata: formatKopoMetadata(k.description, meta, { guest, purpose }),
        transactionRef: k.transactionReference || k.reference || '',
        walletCredited: k.walletCredited,
        allocatable: success && !k.walletCredited && purpose !== 'pos_sale' && !k.posCompleted && k.amount > 0,
        payload,
      };
    });

    const guestPosRows = guestPosSales
      .filter((tx) => !linkedPosIds.has(tx.id))
      .map((tx) => {
        const isCash = tx.paymentMethod === 'cash';
        const source = isCash ? 'pos_cash' : 'pos_mpesa';
        const channel = tx.cashierId === 'kiosk' ? 'Kiosk' : 'POS';

        const payload = {
          source,
          guest: true,
          posTransactionId: tx.id,
          receiptNo: tx.receiptNo,
          totalAmount: tx.totalAmount,
          paymentMethod: tx.paymentMethod,
          cashierId: tx.cashierId,
          channel,
          items: tx.items.map((line) => ({
            name: line.menuItem.name,
            quantity: line.quantity,
            price: line.price,
          })),
          createdAt: tx.createdAt,
        };

        return {
          id: tx.id,
          source,
          mpesaNumber: '',
          date: tx.createdAt,
          name: 'Guest',
          admNo: tx.receiptNo || 'GUEST',
          method: isCash ? `Cash (${channel})` : 'M-Pesa Till (Guest POS)',
          amount: tx.totalAmount,
          attemptedAmount: tx.totalAmount,
          status: 'completed',
          type: 'pos_sale',
          metadata: `Guest · ${isCash ? 'Cash' : 'M-Pesa'} · ${channel} · receipt ${tx.receiptNo || tx.id}`,
          transactionRef: tx.receiptNo || tx.id,
          payload,
        };
      });

    const purchaseRows = purchases.map((t) => {
      const payload = {
        source: 'wallet',
        transactionId: t.id,
        type: t.type,
        amount: t.amount,
        reference: t.reference,
        description: t.description,
        studentId: t.studentId,
        studentName: t.student?.name || null,
        studentRegNo: t.student?.regNo || null,
        createdAt: t.createdAt,
      };

      return {
        id: t.id,
        source: 'wallet',
        mpesaNumber: '',
        date: t.createdAt,
        name: t.student?.name || '',
        admNo: t.student?.regNo || '',
        method: t.type === 'refund' ? 'Wallet Refund' : 'Wallet Purchase',
        amount: t.amount,
        attemptedAmount: Math.abs(t.amount),
        status: 'completed',
        type: t.type,
        metadata: t.description || '',
        transactionRef: t.reference || '',
        payload,
      };
    });

    const depositRows = deposits.map((t) => {
      const payload = {
        source: 'wallet',
        transactionId: t.id,
        type: 'deposit',
        amount: t.amount,
        reference: t.reference,
        description: t.description,
        studentId: t.studentId,
        studentName: t.student?.name || null,
        studentRegNo: t.student?.regNo || null,
        createdAt: t.createdAt,
      };

      return {
        id: t.id,
        source: 'wallet',
        mpesaNumber: '',
        date: t.createdAt,
        name: t.student?.name || '',
        admNo: t.student?.regNo || '',
        method: 'Wallet Top-up (Manual)',
        amount: t.amount,
        attemptedAmount: t.amount,
        status: 'completed',
        type: 'deposit',
        metadata: t.description || 'Wallet top-up',
        transactionRef: t.reference || '',
        payload,
      };
    });

    const rows = [...kopoRows, ...guestPosRows, ...depositRows, ...purchaseRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

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

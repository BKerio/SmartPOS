import bcrypt from 'bcrypt';
import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Failed to process sale';
};

const mapSaleError = (message: string): { status: number; body: { message: string } } | null => {
  if (message === 'STUDENT_NOT_FOUND') {
    return { status: 404, body: { message: 'Student not found' } };
  }
  if (message === 'INSUFFICIENT_FUNDS' || message === 'INSUFFICIENT_BALANCE') {
    return { status: 402, body: { message: 'Insufficient wallet balance' } };
  }
  if (message === 'INVALID_QUANTITY') {
    return { status: 422, body: { message: 'Each item must have a quantity greater than 0' } };
  }
  if (message === 'WALLET_FROZEN') {
    return { status: 403, body: { message: 'Wallet is frozen. Please contact the parent/admin.' } };
  }
  if (message === 'AUTH_REQUIRED') {
    // 401 triggers global logout in frontend; this is a business-rule failure, not an auth failure
    return { status: 422, body: { message: 'Authorization required (PIN or fingerprint)' } };
  }
  if (message === 'AUTH_NOT_CONFIGURED') {
    return { status: 409, body: { message: 'No PIN or fingerprint is configured for this student' } };
  }
  if (message === 'INVALID_PIN') {
    // 401 triggers global logout in frontend; keep this as a validation error
    return { status: 422, body: { message: 'Invalid wallet PIN' } };
  }
  if (message === 'FINGERPRINT_REQUIRED') {
    return { status: 422, body: { message: 'Fingerprint template is required' } };
  }
  if (message === 'FINGERPRINT_NOT_ENROLLED') {
    return { status: 409, body: { message: 'Student has no fingerprint enrolled' } };
  }
  if (message === 'FINGERPRINT_NO_MATCH') {
    // 401 triggers global logout in frontend; keep this as a validation error
    return { status: 422, body: { message: 'Fingerprint did not match' } };
  }
  if (message.startsWith('DAILY_LIMIT_EXCEEDED')) {
    return { status: 409, body: { message: 'Daily spend limit reached' } };
  }
  if (message.startsWith('WEEKLY_LIMIT_EXCEEDED')) {
    return { status: 409, body: { message: 'Weekly spend limit reached' } };
  }
  if (message.startsWith('ITEM_NOT_FOUND')) {
    return { status: 422, body: { message: 'One or more menu items were not found' } };
  }
  if (message.startsWith('ITEM_UNAVAILABLE')) {
    const name = message.split(':')[1];
    return { status: 422, body: { message: name ? `${name} is currently unavailable` : 'An item is unavailable' } };
  }
  return null;
};

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

// Monday 00:00 UTC
const startOfUtcWeek = (date: Date) => {
  const dayStart = startOfUtcDay(date);
  const dow = dayStart.getUTCDay(); // 0=Sun..6=Sat
  const diff = (dow + 6) % 7; // days since Monday
  return new Date(dayStart.getTime() - diff * 24 * 60 * 60 * 1000);
};

const SCANNER_URL = process.env.FINGERPRINT_SCANNER_URL || 'http://127.0.0.1:17890';
const SCANNER_TIMEOUT_MS = 8_000;

const verifyFingerprint = async (candidateTemplate: string, storedTemplate: string): Promise<boolean> => {
  const res = await fetch(`${SCANNER_URL}/check-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: candidateTemplate, candidates: [storedTemplate] }),
    signal: AbortSignal.timeout(SCANNER_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return Boolean(res.ok && data?.ok && data?.isDuplicate === true && data?.matchedIndex === 0);
};

const assertSaleAuthorized = async (student: any, auth: any): Promise<void> => {
  const pinEnabled = Boolean(student.walletPinHash);
  const fpEnabled = Boolean(student.fingerprintTemplate);

  if (!pinEnabled && !fpEnabled) throw new Error('AUTH_NOT_CONFIGURED');

  const pin = typeof auth?.pin === 'string' ? auth.pin.trim() : '';
  const fp = typeof auth?.fingerprintTemplate === 'string' ? auth.fingerprintTemplate.trim() : '';

  // prefer PIN if provided
  if (pin) {
    if (!pinEnabled) throw new Error('AUTH_REQUIRED');
    if (!/^\d{4}$/.test(pin)) throw new Error('INVALID_PIN');
    const ok = await bcrypt.compare(pin, student.walletPinHash);
    if (!ok) throw new Error('INVALID_PIN');
    return;
  }

  // otherwise fingerprint
  if (fp) {
    if (!fpEnabled) throw new Error('FINGERPRINT_NOT_ENROLLED');
    const match = await verifyFingerprint(fp, student.fingerprintTemplate);
    if (!match) throw new Error('FINGERPRINT_NO_MATCH');
    return;
  }

  throw new Error('AUTH_REQUIRED');
};

// ─── POST /api/pos/sale ───────────────────────────────────────────────────────
router.post('/sale', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
  if (!['admin', 'restaurant'].includes(req.user!.role)) {
    res.status(403).json({ message: 'Only restaurant staff can process sales' });
    return;
  }

  const { studentRegNo, items, auth } = req.body;

  if (!studentRegNo || !Array.isArray(items) || items.length === 0) {
    res.status(422).json({ message: 'Student registration number and items array are required' });
    return;
  }

  const cashierId = req.user!.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({ where: { regNo: studentRegNo } });
      if (!student) throw new Error('STUDENT_NOT_FOUND');
      if (student.walletFrozen) throw new Error('WALLET_FROZEN');

      await assertSaleAuthorized(student, auth);

      const itemIds = items.map((i: { menuItemId: string }) => i.menuItemId);
      const menuItems = await tx.menuItem.findMany({ where: { id: { in: itemIds } } });

      let totalAmount = 0;
      const orderLines = items.map((cartItem: { menuItemId: string; quantity: number }) => {
        const quantity = Math.floor(Number(cartItem.quantity));
        const menuItem = menuItems.find((m) => m.id === cartItem.menuItemId);

        if (!menuItem) throw new Error(`ITEM_NOT_FOUND:${cartItem.menuItemId}`);
        if (!menuItem.isAvailable) throw new Error(`ITEM_UNAVAILABLE:${menuItem.name}`);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_QUANTITY');

        const lineTotal = menuItem.price * quantity;
        totalAmount += lineTotal;

        return { menuItemId: menuItem.id, quantity, price: menuItem.price };
      });

      if (student.walletBalance < totalAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // Spend limits
      const now = new Date();
      const dayStart = startOfUtcDay(now);
      const weekStart = startOfUtcWeek(now);

      if (student.dailySpendLimit != null) {
        const daily = await tx.posTransaction.aggregate({
          where: { studentId: student.id, status: 'completed', createdAt: { gte: dayStart } },
          _sum: { totalAmount: true },
        });
        const spentToday = Number(daily._sum.totalAmount || 0);
        if (spentToday + totalAmount > Number(student.dailySpendLimit)) throw new Error('DAILY_LIMIT_EXCEEDED');
      }
      if (student.weeklySpendLimit != null) {
        const weekly = await tx.posTransaction.aggregate({
          where: { studentId: student.id, status: 'completed', createdAt: { gte: weekStart } },
          _sum: { totalAmount: true },
        });
        const spentWeek = Number(weekly._sum.totalAmount || 0);
        if (spentWeek + totalAmount > Number(student.weeklySpendLimit)) throw new Error('WEEKLY_LIMIT_EXCEEDED');
      }

      const posTx = await tx.posTransaction.create({
        data: {
          studentId: student.id,
          cashierId,
          totalAmount,
          items: { create: orderLines },
        },
        include: { items: true },
      });

      const updatedStudent = await tx.student.update({
        where: { id: student.id },
        data: { walletBalance: { decrement: totalAmount } },
        select: { id: true, name: true, regNo: true, walletBalance: true },
      });

      await tx.walletTransaction.create({
        data: {
          studentId: student.id,
          amount: -totalAmount,
          type: 'purchase',
          reference: posTx.id,
          description: `Cafeteria purchase (Receipt: ${posTx.id.slice(-6)})`,
        },
      });

      return { student: updatedStudent, posTx, totalAmount };
    });

    await logAuditEvent({
      eventType: 'pos_sale',
      userType: req.user!.role,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Cafeteria Sale',
      description: `Processed sale of KES ${result.totalAmount} for ${result.student.name}`,
      metadata: { receiptId: result.posTx.id, studentRegNo },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: 'Sale completed successfully',
      receipt: result.posTx,
      newBalance: result.student.walletBalance,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('POS Sale Error:', message);

    const mapped = mapSaleError(message);
    if (mapped !== null) {
      res.status(mapped!.status).json(mapped!.body);
      return;
    }

    res.status(500).json({ message: 'Failed to process sale' });
  }
});

// ─── POST /api/pos/student-order ──────────────────────────────────────────────
// Student self-checkout from wallet balance
router.post('/student-order', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
  // Disabled: student ordering is now handled at restaurant POS with authorization
  res.status(403).json({ message: 'Student ordering is disabled. Please use the restaurant POS.' });
  return;

  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    res.status(422).json({ message: 'Cart items are required' });
    return;
  }

  const studentId = req.user!.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({ where: { id: studentId } });
      if (!student) throw new Error('STUDENT_NOT_FOUND');
      if (student.walletFrozen) throw new Error('WALLET_FROZEN');

      const itemIds = items.map((i: { menuItemId: string }) => i.menuItemId);
      const menuItems = await tx.menuItem.findMany({ where: { id: { in: itemIds } } });

      let totalAmount = 0;
      const orderLines = items.map((cartItem: { menuItemId: string; quantity: number }) => {
        const quantity = Math.floor(Number(cartItem.quantity));
        const menuItem = menuItems.find((m) => m.id === cartItem.menuItemId);

        if (!menuItem) throw new Error(`ITEM_NOT_FOUND:${cartItem.menuItemId}`);
        if (!menuItem.isAvailable) throw new Error(`ITEM_UNAVAILABLE:${menuItem.name}`);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_QUANTITY');

        totalAmount += menuItem.price * quantity;
        return { menuItemId: menuItem.id, quantity, price: menuItem.price };
      });

      if (student.walletBalance < totalAmount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      // Spend limits
      const now = new Date();
      const dayStart = startOfUtcDay(now);
      const weekStart = startOfUtcWeek(now);

      if (student.dailySpendLimit != null) {
        const daily = await tx.posTransaction.aggregate({
          where: { studentId: student.id, status: 'completed', createdAt: { gte: dayStart } },
          _sum: { totalAmount: true },
        });
        const spentToday = Number(daily._sum.totalAmount || 0);
        if (spentToday + totalAmount > Number(student.dailySpendLimit)) throw new Error('DAILY_LIMIT_EXCEEDED');
      }
      if (student.weeklySpendLimit != null) {
        const weekly = await tx.posTransaction.aggregate({
          where: { studentId: student.id, status: 'completed', createdAt: { gte: weekStart } },
          _sum: { totalAmount: true },
        });
        const spentWeek = Number(weekly._sum.totalAmount || 0);
        if (spentWeek + totalAmount > Number(student.weeklySpendLimit)) throw new Error('WEEKLY_LIMIT_EXCEEDED');
      }

      const posTx = await tx.posTransaction.create({
        data: {
          studentId,
          cashierId: 'self-service',
          totalAmount,
          items: { create: orderLines },
        },
        include: { items: { include: { menuItem: { select: { name: true } } } } },
      });

      const updatedStudent = await tx.student.update({
        where: { id: studentId },
        data: { walletBalance: { decrement: totalAmount } },
        select: { id: true, name: true, regNo: true, walletBalance: true },
      });

      await tx.walletTransaction.create({
        data: {
          studentId,
          amount: -totalAmount,
          type: 'purchase',
          reference: posTx.id,
          description: `Meal order (Receipt: ${posTx.id.slice(-6)})`,
        },
      });

      return { student: updatedStudent, posTx, totalAmount };
    });

    await logAuditEvent({
      eventType: 'student_order',
      userType: 'student',
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Student Meal Order',
      description: `Ordered meals worth KES ${result.totalAmount}`,
      metadata: { receiptId: result.posTx.id },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: 'Order placed successfully',
      receipt: result.posTx,
      newBalance: result.student.walletBalance,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('Student order error:', message);

    const mapped = mapSaleError(message);
    if (mapped !== null) {
      res.status(mapped!.status).json(mapped!.body);
      return;
    }

    res.status(500).json({ message: 'Failed to place order' });
  }
});

// ─── GET /api/pos/receipts/me ─────────────────────────────────────────────────
router.get('/receipts/me', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
  if (req.user!.role !== 'student') {
    res.status(403).json({ message: 'Student access only' });
    return;
  }

  try {
    const receipts = await prisma.posTransaction.findMany({
      where: { studentId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
      },
    });
    res.json(receipts);
  } catch {
    res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/pos/receipts ────────────────────────────────────────────────────
router.get('/receipts', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
  if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
    res.status(403).json({ message: 'Not authorized' });
    return;
  }

  try {
    const receipts = await prisma.posTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        student: { select: { name: true, regNo: true } },
        items: { include: { menuItem: { select: { name: true } } } },
      },
    });
    res.json(receipts);
  } catch {
    res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

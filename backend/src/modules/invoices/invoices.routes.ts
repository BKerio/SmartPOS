import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import prisma from '@/services/prisma';
import { staffNames } from '@/services/staffNames';
import { ensureAuthenticated } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';
import { deductStockForOrder, returnStockForOrder } from '@/services/inventoryDeduction';

/*
 * Sales invoices: food served now and paid later (staff meals on account, events, visitors on credit).
 * Each invoice names the waiter who served it, so outstanding balances can be followed up per waiter.
 *
 *   GET  /api/invoices/waiters          staff who can be named as the waiter
 *   GET  /api/invoices                  list (filters, paging) + totals + outstanding per waiter
 *   GET  /api/invoices/:id              one invoice with items and payments
 *   POST /api/invoices                  raise an invoice (deducts stock like a sale)
 *   POST /api/invoices/:id/payments     record a payment against it
 *   POST /api/invoices/:id/cancel       cancel an unpaid invoice (admin / finance)
 *   PATCH /api/invoices/:id             edit details and/or items (stock moves by the difference)
 *   DELETE /api/invoices/:id            delete a mistaken invoice with no payments (admin; stock returned)
 *   M-Pesa STK payments go through /api/kopokopo/stkpush (purpose invoice_payment) → applyInvoiceStkPayment
 */

const CAN_VIEW = ['admin', 'restaurant', 'finance'];
const CAN_RAISE = ['admin', 'restaurant'];
const CAN_COLLECT = ['admin', 'restaurant', 'finance'];
const PAY_METHODS = ['cash', 'mpesa', 'bank', 'card'];

const round2 = (n: number) => Math.round(n * 100) / 100;

function statusFor(total: number, paid: number): 'unpaid' | 'partial' | 'paid' {
  if (paid <= 0) return 'unpaid';
  return paid + 0.005 >= total ? 'paid' : 'partial';
}

/** INV-YYMMDD-NNN, numbered per day (East Africa Time). */
async function nextInvoiceNo(): Promise<string> {
  const eat = new Date(Date.now() + 3 * 3600_000);
  const stamp = eat.toISOString().slice(2, 10).replace(/-/g, '');
  const prefix = `INV-${stamp}-`;
  const last = await prisma.salesInvoice.findFirst({
    where: { invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  });
  const n = last ? Number(last.invoiceNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
}

const namesFor = (ids: string[]) => staffNames(ids);

function parseDay(value: unknown, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return undefined;
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}+03:00`);
}

export default async function invoiceRoutes(app: App) {
  // ─── GET /api/invoices/waiters ─────────────────────────────────────────────
  app.get('/waiters', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_VIEW.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const waiters = await prisma.user.findMany({
      where: { role: 'restaurant', status: 'approved' },
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    });
    return res.send(waiters);
  });

  // ─── GET /api/invoices ─────────────────────────────────────────────────────
  app.get('/', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_VIEW.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
    const from = parseDay(q.from);
    const to = parseDay(q.to, true);
    const search = (q.search || '').trim();

    const where: any = {
      ...(q.status === 'open' ? { status: { in: ['unpaid', 'partial'] } } : q.status && q.status !== 'all' ? { status: q.status } : {}),
      ...(q.waiterId ? { waiterId: q.waiterId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNo: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    try {
      const now = new Date();
      const [rows, total, open, overdue, paidThisMonth, perWaiter] = await Promise.all([
        prisma.salesInvoice.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { _count: { select: { items: true } } },
        }),
        prisma.salesInvoice.count({ where }),
        prisma.salesInvoice.aggregate({ _count: true, _sum: { totalAmount: true, paidAmount: true }, where: { status: { in: ['unpaid', 'partial'] } } }),
        prisma.salesInvoice.aggregate({
          _count: true,
          _sum: { totalAmount: true, paidAmount: true },
          where: { status: { in: ['unpaid', 'partial'] }, dueDate: { lt: now } },
        }),
        prisma.invoicePayment.aggregate({
          _sum: { amount: true },
          where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        }),
        prisma.salesInvoice.groupBy({
          by: ['waiterId'],
          where: { status: { in: ['unpaid', 'partial'] } },
          _count: true,
          _sum: { totalAmount: true, paidAmount: true },
        }),
      ]);

      const names = await namesFor([...rows.flatMap((r) => [r.waiterId, r.createdById]), ...perWaiter.map((w) => w.waiterId)]);
      return res.send({
        rows: rows.map((r) => ({
          ...r,
          itemCount: r._count.items,
          balance: round2(r.totalAmount - r.paidAmount),
          waiterName: names.get(r.waiterId) || 'Unknown',
          createdByName: names.get(r.createdById) || 'Unknown',
          overdue: ['unpaid', 'partial'].includes(r.status) && !!r.dueDate && r.dueDate < now,
        })),
        page,
        limit,
        total,
        summary: {
          openCount: open._count,
          outstanding: round2((open._sum.totalAmount ?? 0) - (open._sum.paidAmount ?? 0)),
          overdueCount: overdue._count,
          overdueAmount: round2((overdue._sum.totalAmount ?? 0) - (overdue._sum.paidAmount ?? 0)),
          collectedThisMonth: paidThisMonth._sum.amount ?? 0,
        },
        byWaiter: perWaiter
          .map((w) => ({
            waiterId: w.waiterId,
            waiterName: names.get(w.waiterId) || 'Unknown',
            openCount: w._count,
            outstanding: round2((w._sum.totalAmount ?? 0) - (w._sum.paidAmount ?? 0)),
          }))
          .sort((a, b) => b.outstanding - a.outstanding),
      });
    } catch (error) {
      req.log.error(error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/invoices/:id ─────────────────────────────────────────────────
  app.get('/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_VIEW.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: String(req.params.id) },
      include: { items: true, payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!invoice) return res.status(404).send({ message: 'Invoice not found' });
    const names = await namesFor([invoice.waiterId, invoice.createdById, ...invoice.payments.map((p) => p.receivedById)]);
    return res.send({
      ...invoice,
      balance: round2(invoice.totalAmount - invoice.paidAmount),
      waiterName: names.get(invoice.waiterId) || 'Unknown',
      createdByName: names.get(invoice.createdById) || 'Unknown',
      payments: invoice.payments.map((p) => ({ ...p, receivedByName: names.get(p.receivedById) || 'Unknown' })),
    });
  });

  // ─── POST /api/invoices ────────────────────────────────────────────────────
  app.post('/', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_RAISE.includes(req.user!.role)) return res.status(403).send({ message: 'Only restaurant staff can raise invoices' });
    const { customerName, customerPhone, waiterId, dueDate, notes, items } = req.body as {
      customerName?: string;
      customerPhone?: string;
      waiterId?: string;
      dueDate?: string;
      notes?: string;
      items?: { menuItemId: string; quantity: number }[];
    };

    if (!customerName?.trim()) return res.status(422).send({ message: 'Customer name is required' });
    if (!waiterId) return res.status(422).send({ message: 'Choose the waiter who served this order' });
    if (!Array.isArray(items) || items.length === 0) return res.status(422).send({ message: 'Add at least one item' });

    const waiter = await prisma.user.findUnique({ where: { id: waiterId }, select: { id: true, name: true } });
    if (!waiter) return res.status(422).send({ message: 'Waiter not found' });

    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const menuItems = await tx.menuItem.findMany({ where: { id: { in: items.map((i) => i.menuItemId) } } });
        const lines = items.map((line) => {
          const quantity = Math.floor(Number(line.quantity));
          const menuItem = menuItems.find((m) => m.id === line.menuItemId);
          if (!menuItem) throw new Error(`ITEM_NOT_FOUND:${line.menuItemId}`);
          if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_QUANTITY');
          return { menuItem, quantity };
        });

        // Served food leaves the kitchen exactly like a sale.
        await deductStockForOrder(
          tx,
          lines.map((l) => ({ menuItemId: l.menuItem.id, quantity: l.quantity, price: l.menuItem.price })),
          { userId: req.user!.id, receiptNo: 'invoice' },
        );

        const totalAmount = round2(lines.reduce((s, l) => s + l.menuItem.price * l.quantity, 0));
        return tx.salesInvoice.create({
          data: {
            invoiceNo: await nextInvoiceNo(),
            customerName: customerName.trim(),
            customerPhone: customerPhone?.trim() || null,
            waiterId,
            createdById: req.user!.id,
            totalAmount,
            dueDate: dueDate ? new Date(`${dueDate}T23:59:59+03:00`) : null,
            notes: notes?.trim() || null,
            items: {
              create: lines.map((l) => ({
                menuItemId: l.menuItem.id,
                description: l.menuItem.name,
                quantity: l.quantity,
                unitPrice: l.menuItem.price,
                total: round2(l.menuItem.price * l.quantity),
              })),
            },
          },
          include: { items: true },
        });
      });

      await logAuditEvent({
        eventType: 'invoice_created',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Raise Sales Invoice',
        description: `Invoice ${invoice.invoiceNo} for ${invoice.customerName}: KES ${invoice.totalAmount} (waiter ${waiter.name})`,
        metadata: { invoiceId: invoice.id, waiterId },
        ipAddress: req.ip,
      });
      return res.status(201).send({ ...invoice, waiterName: waiter.name, balance: invoice.totalAmount });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.startsWith('INSUFFICIENT_STOCK:')) return res.status(409).send({ message: `Not enough stock: ${msg.split(':').slice(1).join(':')}` });
      if (msg.startsWith('ITEM_NOT_FOUND')) return res.status(404).send({ message: 'A menu item no longer exists' });
      if (msg === 'INVALID_QUANTITY') return res.status(422).send({ message: 'Each item needs a quantity above 0' });
      req.log.error(error);
      return res.status(500).send({ message: 'Could not raise the invoice' });
    }
  });

  // ─── POST /api/invoices/:id/payments ───────────────────────────────────────
  app.post('/:id/payments', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_COLLECT.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const { amount, method, reference } = req.body as { amount?: number; method?: string; reference?: string };
    const value = round2(Number(amount));
    if (!Number.isFinite(value) || value <= 0) return res.status(422).send({ message: 'Enter an amount above 0' });
    if (!method || !PAY_METHODS.includes(method)) return res.status(422).send({ message: 'Choose how it was paid' });
    if (method === 'mpesa' && !reference?.trim()) return res.status(422).send({ message: 'Enter the M-Pesa code' });

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const invoice = await tx.salesInvoice.findUnique({ where: { id: String(req.params.id) } });
        if (!invoice) throw new Error('NOT_FOUND');
        if (invoice.status === 'cancelled') throw new Error('CANCELLED');
        const balance = round2(invoice.totalAmount - invoice.paidAmount);
        if (balance <= 0) throw new Error('ALREADY_PAID');
        if (value > balance + 0.005) throw new Error(`OVERPAY:${balance}`);
        await tx.invoicePayment.create({
          data: { invoiceId: invoice.id, amount: value, method, reference: reference?.trim().toUpperCase() || null, receivedById: req.user!.id },
        });
        const paidAmount = round2(invoice.paidAmount + value);
        return tx.salesInvoice.update({
          where: { id: invoice.id },
          data: { paidAmount, status: statusFor(invoice.totalAmount, paidAmount) },
        });
      });

      await logAuditEvent({
        eventType: 'invoice_payment',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Invoice Payment',
        description: `KES ${value} (${method}${reference ? ` ${reference}` : ''}) on ${updated.invoiceNo}; balance KES ${round2(updated.totalAmount - updated.paidAmount)}`,
        metadata: { invoiceId: updated.id },
        ipAddress: req.ip,
      });
      return res.send({ ...updated, balance: round2(updated.totalAmount - updated.paidAmount) });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg === 'NOT_FOUND') return res.status(404).send({ message: 'Invoice not found' });
      if (msg === 'CANCELLED') return res.status(409).send({ message: 'This invoice was cancelled' });
      if (msg === 'ALREADY_PAID') return res.status(409).send({ message: 'This invoice is already fully paid' });
      if (msg.startsWith('OVERPAY:')) return res.status(422).send({ message: `That's more than the balance (KES ${msg.split(':')[1]})` });
      req.log.error(error);
      return res.status(500).send({ message: 'Could not record the payment' });
    }
  });

  // ─── POST /api/invoices/:id/cancel ─────────────────────────────────────────
  // Only invoices with no payments can be cancelled. Stock already issued is not returned.
  app.post('/:id/cancel', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'finance'].includes(req.user!.role)) return res.status(403).send({ message: 'Only admin or finance can cancel invoices' });
    const invoice = await prisma.salesInvoice.findUnique({ where: { id: String(req.params.id) } });
    if (!invoice) return res.status(404).send({ message: 'Invoice not found' });
    if (invoice.paidAmount > 0) return res.status(409).send({ message: 'Invoices with payments cannot be cancelled' });
    if (invoice.status === 'cancelled') return res.send(invoice);
    const { reason } = req.body as { reason?: string };
    const updated = await prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: { status: 'cancelled', notes: [invoice.notes, reason ? `Cancelled: ${reason}` : 'Cancelled'].filter(Boolean).join('\n') },
    });
    await logAuditEvent({
      eventType: 'invoice_cancelled',
      userType: req.user!.role,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Cancel Invoice',
      description: `Cancelled ${invoice.invoiceNo} (KES ${invoice.totalAmount})${reason ? `: ${reason}` : ''}`,
      metadata: { invoiceId: invoice.id },
      ipAddress: req.ip,
    });
    return res.send(updated);
  });

  // ─── PATCH /api/invoices/:id ───────────────────────────────────────────────
  // Customer, phone, waiter, due date and notes can always be corrected on an open invoice.
  // Items can change too; stock moves by the difference only, and the new total can't drop below what was paid.
  app.patch('/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_RAISE.includes(req.user!.role)) return res.status(403).send({ message: 'Only admin or restaurant staff can edit invoices' });
    const body = req.body as {
      customerName?: string;
      customerPhone?: string | null;
      waiterId?: string;
      dueDate?: string | null;
      notes?: string | null;
      items?: { menuItemId: string; quantity: number }[];
    };
    if (body.customerName !== undefined && !body.customerName.trim()) return res.status(422).send({ message: 'Customer name is required' });
    if (body.items !== undefined && (!Array.isArray(body.items) || body.items.length === 0)) return res.status(422).send({ message: 'Add at least one item' });

    let waiterName: string | undefined;
    if (body.waiterId) {
      const waiter = await prisma.user.findUnique({ where: { id: body.waiterId }, select: { name: true } });
      if (!waiter) return res.status(422).send({ message: 'Waiter not found' });
      waiterName = waiter.name;
    }

    try {
      const { before, after } = await prisma.$transaction(async (tx) => {
        const invoice = await tx.salesInvoice.findUnique({ where: { id: String(req.params.id) }, include: { items: true } });
        if (!invoice) throw new Error('NOT_FOUND');
        if (invoice.status === 'cancelled') throw new Error('CANCELLED');
        if (invoice.status === 'paid' && body.items) throw new Error('PAID_ITEMS');

        let totalAmount = invoice.totalAmount;
        let itemWrites: any = undefined;
        if (body.items) {
          const wanted = new Map<string, number>();
          for (const line of body.items) {
            const q = Math.floor(Number(line.quantity));
            if (!Number.isFinite(q) || q <= 0) throw new Error('INVALID_QUANTITY');
            wanted.set(line.menuItemId, (wanted.get(line.menuItemId) || 0) + q);
          }
          const had = new Map<string, number>();
          for (const it of invoice.items) if (it.menuItemId) had.set(it.menuItemId, (had.get(it.menuItemId) || 0) + it.quantity);

          const menuItems = await tx.menuItem.findMany({ where: { id: { in: [...wanted.keys()] } } });
          const menuById = new Map(menuItems.map((m) => [m.id, m]));
          for (const id of wanted.keys()) if (!menuById.has(id)) throw new Error(`ITEM_NOT_FOUND:${id}`);
          // Keep the price each existing line was invoiced at; new lines take today's menu price.
          const priceFor = (id: string) => invoice.items.find((i) => i.menuItemId === id)?.unitPrice ?? menuById.get(id)!.price;

          const added: { menuItemId: string; quantity: number; price: number }[] = [];
          const removed: { menuItemId: string; quantity: number }[] = [];
          for (const id of new Set([...wanted.keys(), ...had.keys()])) {
            const diff = (wanted.get(id) || 0) - (had.get(id) || 0);
            if (diff > 0) added.push({ menuItemId: id, quantity: diff, price: priceFor(id) });
            if (diff < 0) removed.push({ menuItemId: id, quantity: -diff });
          }
          const opts = { userId: req.user!.id, receiptNo: invoice.invoiceNo };
          if (removed.length) await returnStockForOrder(tx, removed, opts);
          if (added.length) await deductStockForOrder(tx, added, opts);

          const lines = [...wanted.entries()].map(([id, quantity]) => {
            const unitPrice = priceFor(id);
            return { menuItemId: id, description: menuById.get(id)!.name, quantity, unitPrice, total: round2(unitPrice * quantity) };
          });
          totalAmount = round2(lines.reduce((s, l) => s + l.total, 0));
          if (totalAmount + 0.005 < invoice.paidAmount) throw new Error(`BELOW_PAID:${invoice.paidAmount}`);
          itemWrites = { deleteMany: {}, create: lines };
        }

        const after = await tx.salesInvoice.update({
          where: { id: invoice.id },
          data: {
            ...(body.customerName !== undefined ? { customerName: body.customerName.trim() } : {}),
            ...(body.customerPhone !== undefined ? { customerPhone: body.customerPhone?.trim() || null } : {}),
            ...(body.waiterId ? { waiterId: body.waiterId } : {}),
            ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(`${body.dueDate}T23:59:59+03:00`) : null } : {}),
            ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
            ...(itemWrites ? { items: itemWrites, totalAmount, status: statusFor(totalAmount, invoice.paidAmount) } : {}),
          },
          include: { items: true },
        });
        return { before: invoice, after };
      });

      const changes: string[] = [];
      if (before.customerName !== after.customerName) changes.push(`customer ${before.customerName} → ${after.customerName}`);
      if (before.waiterId !== after.waiterId) changes.push(`waiter → ${waiterName}`);
      if (before.totalAmount !== after.totalAmount) changes.push(`total KES ${before.totalAmount} → ${after.totalAmount}`);
      if (String(before.dueDate) !== String(after.dueDate)) changes.push('due date');
      if ((before.customerPhone || '') !== (after.customerPhone || '')) changes.push('phone');
      if ((before.notes || '') !== (after.notes || '')) changes.push('notes');
      await logAuditEvent({
        eventType: 'invoice_updated',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Edit Invoice',
        description: `Edited ${after.invoiceNo}${changes.length ? `: ${changes.join(', ')}` : ''}`,
        metadata: { invoiceId: after.id },
        ipAddress: req.ip,
      });
      const names = await namesFor([after.waiterId]);
      return res.send({ ...after, balance: round2(after.totalAmount - after.paidAmount), waiterName: names.get(after.waiterId) || 'Unknown' });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg === 'NOT_FOUND') return res.status(404).send({ message: 'Invoice not found' });
      if (msg === 'CANCELLED') return res.status(409).send({ message: 'A cancelled invoice cannot be edited' });
      if (msg === 'PAID_ITEMS') return res.status(409).send({ message: 'Items on a fully paid invoice cannot be changed' });
      if (msg.startsWith('BELOW_PAID:')) return res.status(422).send({ message: `The new total is less than the KES ${msg.split(':')[1]} already paid` });
      if (msg.startsWith('INSUFFICIENT_STOCK:')) return res.status(409).send({ message: `Not enough stock: ${msg.split(':').slice(1).join(':')}` });
      if (msg.startsWith('INSUFFICIENT_INGREDIENT:')) return res.status(409).send({ message: `Not enough ${msg.split(':').slice(1).join(':')} in the store` });
      if (msg.startsWith('ITEM_NOT_FOUND')) return res.status(404).send({ message: 'A menu item no longer exists' });
      if (msg === 'INVALID_QUANTITY') return res.status(422).send({ message: 'Each item needs a quantity above 0' });
      req.log.error(error);
      return res.status(500).send({ message: 'Could not update the invoice' });
    }
  });

  // ─── DELETE /api/invoices/:id ──────────────────────────────────────────────
  // For invoices raised by mistake: admin only, nothing paid. Stock is returned (unlike cancel,
  // where the food was served). Cancelled invoices can be deleted too; their stock stays issued.
  app.delete('/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (req.user!.role !== 'admin') return res.status(403).send({ message: 'Only an admin can delete invoices' });
    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const invoice = await tx.salesInvoice.findUnique({ where: { id: String(req.params.id) }, include: { items: true, _count: { select: { payments: true } } } });
        if (!invoice) throw new Error('NOT_FOUND');
        if (invoice.paidAmount > 0 || invoice._count.payments > 0) throw new Error('HAS_PAYMENTS');
        const pendingStk = await tx.kopoPayment.count({ where: { invoiceId: invoice.id, status: 'pending' } });
        if (pendingStk > 0) throw new Error('STK_PENDING');
        if (invoice.status !== 'cancelled') {
          await returnStockForOrder(
            tx,
            invoice.items.filter((i) => i.menuItemId).map((i) => ({ menuItemId: i.menuItemId!, quantity: i.quantity })),
            { userId: req.user!.id, receiptNo: invoice.invoiceNo },
          );
        }
        await tx.salesInvoice.delete({ where: { id: invoice.id } });
        return invoice;
      });
      await logAuditEvent({
        eventType: 'invoice_deleted',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Delete Invoice',
        description: `Deleted ${invoice.invoiceNo} for ${invoice.customerName} (KES ${invoice.totalAmount})${invoice.status !== 'cancelled' ? '; stock returned' : ''}`,
        metadata: { invoiceId: invoice.id, items: invoice.items.map((i) => `${i.quantity} × ${i.description}`) },
        ipAddress: req.ip,
      });
      return res.send({ deleted: true, invoiceNo: invoice.invoiceNo });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg === 'NOT_FOUND') return res.status(404).send({ message: 'Invoice not found' });
      if (msg === 'HAS_PAYMENTS') return res.status(409).send({ message: 'This invoice has payments, so it cannot be deleted' });
      if (msg === 'STK_PENDING') return res.status(409).send({ message: 'An M-Pesa prompt for this invoice is still pending' });
      req.log.error(error);
      return res.status(500).send({ message: 'Could not delete the invoice' });
    }
  });
}

/**
 * Posts a confirmed M-Pesa STK payment to its invoice. Safe to call more than once for the same
 * KopoKopo payment (callback, webhook and status poll can all land): the unique kopoPaymentId wins.
 * If the invoice was settled some other way meanwhile, only the remaining balance is applied and the
 * excess is noted on the payment so finance can refund or reallocate it.
 */
export async function applyInvoiceStkPayment(kopoPaymentId: string): Promise<boolean> {
  const kopo = await prisma.kopoPayment.findUnique({ where: { id: kopoPaymentId } });
  if (!kopo || kopo.purpose !== 'invoice_payment' || !kopo.invoiceId) return false;
  const reference = (kopo.transactionReference || kopo.reference || '').trim().toUpperCase() || null;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const already = await tx.invoicePayment.findUnique({ where: { kopoPaymentId } });
      if (already) return null;
      const invoice = await tx.salesInvoice.findUnique({ where: { id: kopo.invoiceId! } });
      if (!invoice || invoice.status === 'cancelled') throw new Error('INVOICE_GONE');
      const balance = round2(invoice.totalAmount - invoice.paidAmount);
      const applied = round2(Math.min(kopo.amount, Math.max(0, balance)));
      if (applied <= 0) throw new Error('NOTHING_DUE');
      await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: applied,
          method: 'mpesa',
          reference,
          kopoPaymentId,
          receivedById: kopo.payerUserId || 'system',
        },
      });
      const paidAmount = round2(invoice.paidAmount + applied);
      const updated = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount, status: statusFor(invoice.totalAmount, paidAmount) },
      });
      return { updated, applied, excess: round2(kopo.amount - applied) };
    });
    if (!result) return true;
    await logAuditEvent({
      eventType: 'invoice_payment',
      userType: kopo.payerRole || 'system',
      userId: kopo.payerUserId || 'system',
      userName: 'M-Pesa STK',
      action: 'Invoice Payment',
      description: `KES ${result.applied} (M-Pesa STK ${reference ?? ''}) on ${result.updated.invoiceNo}; balance KES ${round2(result.updated.totalAmount - result.updated.paidAmount)}${result.excess > 0 ? `; KES ${result.excess} over the balance` : ''}`,
      metadata: { invoiceId: result.updated.id, kopoPaymentId },
    });
    return true;
  } catch (err: any) {
    // Money was received but couldn't be posted: leave it unallocated so finance sees it in Collections.
    console.error(`[Invoices] STK payment ${kopoPaymentId} not applied:`, err?.message || err);
    return false;
  }
}

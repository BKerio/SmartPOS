import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import prisma from '@/services/prisma';
import { staffNames } from '@/services/staffNames';
import { ensureAuthenticated } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';

/*
 * Procurement: what came into the store (purchases, with supplier and cost) and what was issued out
 * (to the kitchen or elsewhere), built on the existing stock_movements ledger.
 *
 *   GET  /api/procurement/ledger              movements with filters, paging and totals
 *   GET  /api/procurement/stock-card/:itemId  one item's movements with a running balance
 *   POST /api/procurement/receive             record a purchase into the store
 *   POST /api/procurement/issue               issue stock out of the store
 */

const CAN_VIEW = ['admin', 'restaurant', 'finance'];
const CAN_RECORD = ['admin', 'restaurant'];
const round2 = (n: number) => Math.round(n * 100) / 100;

function dayStart(value: unknown): Date | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00+03:00`) : undefined;
}
function dayEnd(value: unknown): Date | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T23:59:59.999+03:00`) : undefined;
}

const userNames = (ids: (string | null)[]) => staffNames(ids);

export default async function procurementRoutes(app: App) {
  // ─── GET /api/procurement/ledger ───────────────────────────────────────────
  app.get('/ledger', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_VIEW.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 25));
    const from = dayStart(q.from);
    const to = dayEnd(q.to);
    const createdAt = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
    const base: any = {
      ...(createdAt ? { createdAt } : {}),
      ...(q.itemId ? { inventoryItemId: q.itemId } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(q.search
        ? {
            OR: [
              { reference: { contains: q.search, mode: 'insensitive' } },
              { notes: { contains: q.search, mode: 'insensitive' } },
              { issuedTo: { contains: q.search, mode: 'insensitive' } },
              { inventoryItem: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const where = { ...base, ...(q.type === 'IN' || q.type === 'OUT' ? { type: q.type } : {}) };

    try {
      const [rows, total, totalsRaw] = await Promise.all([
        prisma.stockMovement.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            inventoryItem: { select: { id: true, name: true, unit: true, unitCost: true } },
            supplier: { select: { id: true, name: true } },
          },
        }),
        prisma.stockMovement.count({ where }),
        // Received vs issued totals for the same filters (ignoring the type filter), valued at the
        // purchase cost when recorded, else the item's current unit cost.
        prisma.stockMovement.findMany({
          where: base,
          select: { type: true, quantity: true, unitCost: true, inventoryItem: { select: { unitCost: true } } },
        }),
      ]);
      const totals = { receivedCount: 0, receivedValue: 0, issuedCount: 0, issuedValue: 0 };
      for (const m of totalsRaw) {
        const value = m.quantity * (m.unitCost ?? m.inventoryItem.unitCost ?? 0);
        if (m.type === 'IN') { totals.receivedCount++; totals.receivedValue += value; }
        else { totals.issuedCount++; totals.issuedValue += value; }
      }
      const names = await userNames(rows.map((r) => r.userId));
      return res.send({
        rows: rows.map((m) => {
          const unitCost = m.unitCost ?? m.inventoryItem.unitCost ?? 0;
          return { ...m, unitCost, value: round2(m.quantity * unitCost), recordedBy: names.get(m.userId) || 'System' };
        }),
        page,
        limit,
        total,
        totals: { ...totals, receivedValue: round2(totals.receivedValue), issuedValue: round2(totals.issuedValue) },
      });
    } catch (error) {
      req.log.error(error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/procurement/stock-card/:itemId ───────────────────────────────
  app.get('/stock-card/:itemId', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_VIEW.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const q = req.query as Record<string, string>;
    const item = await prisma.inventoryItem.findUnique({ where: { id: String(req.params.itemId) } });
    if (!item) return res.status(404).send({ message: 'Item not found' });
    const from = dayStart(q.from) ?? new Date(Date.now() - 30 * 86400_000);
    const to = dayEnd(q.to) ?? new Date();

    const [inRange, after] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { inventoryItemId: item.id, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
        include: { supplier: { select: { name: true } } },
      }),
      prisma.stockMovement.findMany({ where: { inventoryItemId: item.id, createdAt: { gt: to } }, select: { type: true, quantity: true } }),
    ]);
    // Work backwards from today's stock level to the balance at the start of the range.
    const net = (list: { type: string; quantity: number }[]) => list.reduce((s, m) => s + (m.type === 'IN' ? m.quantity : -m.quantity), 0);
    const closing = item.stockLevel - net(after);
    const opening = closing - net(inRange);
    let balance = opening;
    const names = await userNames(inRange.map((m) => m.userId));
    const rows = inRange.map((m) => {
      balance += m.type === 'IN' ? m.quantity : -m.quantity;
      return {
        id: m.id,
        createdAt: m.createdAt,
        type: m.type,
        reason: m.reason,
        quantity: m.quantity,
        unitCost: m.unitCost ?? item.unitCost,
        supplier: m.supplier?.name ?? null,
        issuedTo: m.issuedTo,
        reference: m.reference,
        notes: m.notes,
        recordedBy: names.get(m.userId) || 'System',
        balance: round2(balance),
      };
    });
    return res.send({ item, from, to, opening: round2(opening), closing: round2(closing), rows });
  });

  // ─── POST /api/procurement/receive ─────────────────────────────────────────
  app.post('/receive', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_RECORD.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const { inventoryItemId, quantity, unitCost, supplierId, reference, notes } = req.body as Record<string, any>;
    const qty = Number(quantity);
    const cost = unitCost === '' || unitCost == null ? null : Number(unitCost);
    if (!inventoryItemId) return res.status(422).send({ message: 'Choose an item' });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(422).send({ message: 'Enter a quantity above 0' });
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return res.status(422).send({ message: 'Unit cost must be 0 or more' });
    if (!supplierId) return res.status(422).send({ message: 'Choose the supplier' });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const movement = await tx.stockMovement.create({
          data: {
            inventoryItemId, type: 'IN', quantity: qty, reason: 'purchase', supplierId,
            reference: reference?.trim() || null, notes: notes?.trim() || null, unitCost: cost, userId: req.user!.id,
          },
        });
        const item = await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          // The latest purchase price becomes the item's unit cost, so stock and consumption are valued at current prices.
          data: { stockLevel: { increment: qty }, ...(cost !== null ? { unitCost: cost } : {}) },
        });
        return { movement, item };
      });
      await logAuditEvent({
        eventType: 'stock_received', userType: req.user!.role, userId: req.user!.id, userName: req.user!.name,
        action: 'Receive Stock',
        description: `Received ${qty} ${result.item.unit} of ${result.item.name}${cost !== null ? ` @ KES ${cost}` : ''}${reference ? ` (${reference})` : ''}`,
        metadata: { movementId: result.movement.id }, ipAddress: req.ip,
      });
      return res.status(201).send(result);
    } catch (error) {
      req.log.error(error);
      return res.status(500).send({ message: 'Could not record the purchase' });
    }
  });

  // ─── POST /api/procurement/issue ───────────────────────────────────────────
  app.post('/issue', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!CAN_RECORD.includes(req.user!.role)) return res.status(403).send({ message: 'Not authorized' });
    const { inventoryItemId, quantity, issuedTo, reason, notes } = req.body as Record<string, any>;
    const qty = Number(quantity);
    const why = ['issue', 'usage', 'spoilage', 'adjustment'].includes(reason) ? reason : 'issue';
    if (!inventoryItemId) return res.status(422).send({ message: 'Choose an item' });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(422).send({ message: 'Enter a quantity above 0' });
    if (!issuedTo?.trim()) return res.status(422).send({ message: 'Say who or where it was issued to' });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
        if (!current) throw new Error('NOT_FOUND');
        if (current.stockLevel < qty) throw new Error(`SHORT:${current.stockLevel} ${current.unit}`);
        const movement = await tx.stockMovement.create({
          data: {
            inventoryItemId, type: 'OUT', quantity: qty, reason: why, issuedTo: issuedTo.trim(),
            notes: notes?.trim() || null, unitCost: current.unitCost, userId: req.user!.id,
          },
        });
        const item = await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { stockLevel: { decrement: qty } } });
        return { movement, item };
      });
      await logAuditEvent({
        eventType: 'stock_issued', userType: req.user!.role, userId: req.user!.id, userName: req.user!.name,
        action: 'Issue Stock',
        description: `Issued ${qty} ${result.item.unit} of ${result.item.name} to ${issuedTo.trim()} (${why})`,
        metadata: { movementId: result.movement.id }, ipAddress: req.ip,
      });
      return res.status(201).send(result);
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg === 'NOT_FOUND') return res.status(404).send({ message: 'Item not found' });
      if (msg.startsWith('SHORT:')) return res.status(409).send({ message: `Only ${msg.slice(6)} in stock` });
      req.log.error(error);
      return res.status(500).send({ message: 'Could not issue stock' });
    }
  });
}

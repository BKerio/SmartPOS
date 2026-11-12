import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';

function devErrorDetail(error: unknown): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return error instanceof Error ? error.message : String(error);
}

export default async function inventoryRoutes(app: App) {

  // ─── GET /api/inventory/items ─────────────────────────────────────────────────
  app.get('/items', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    try {
      const items = await prisma.inventoryItem.findMany({
        orderBy: { category: 'asc' },
      });
      return res.send(items);
    } catch (error) {
      console.error('GET /inventory/items error:', error);
      return res.status(500).send({
        message: 'Something went wrong',
        detail: devErrorDetail(error),
      });
    }
  });

  // ─── POST /api/inventory/items ────────────────────────────────────────────────
  app.post('/items', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { name, category, unit, reorderLevel, unitCost } = req.body;
    if (!name || !category || !unit) {
      return res.status(422).send({ message: 'Name, category, and unit are required' });
    }

    try {
      const item = await prisma.inventoryItem.create({
        data: {
          name,
          category,
          unit,
          reorderLevel: Number(reorderLevel) || 0,
          unitCost: Number(unitCost) || 0,
          stockLevel: 0,
        },
      });

      return res.status(201).send(item);
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── POST /api/inventory/movements ────────────────────────────────────────────
  // Record stock coming in (purchases) or out (usage/spoilage)
  app.post('/movements', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { inventoryItemId, type, quantity, reason, reference, notes, supplierId } = req.body;

    if (!inventoryItemId || !type || !quantity || !reason) {
      return res.status(422).send({ message: 'Required fields missing' });
    }

    const numQuantity = Number(quantity);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const movement = await tx.stockMovement.create({
          data: {
            inventoryItemId,
            type,
            quantity: numQuantity,
            reason,
            reference,
            notes,
            supplierId,
            userId: req.user!.id,
          },
        });

        // Update stock level
        const stockChange = type === 'IN' ? numQuantity : -numQuantity;
        const item = await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: { stockLevel: { increment: stockChange } },
        });

        return { movement, item };
      });

      await logAuditEvent({
        eventType: 'stock_movement',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: `Stock ${type}`,
        description: `Recorded ${numQuantity} ${result.item.unit} of ${result.item.name} (${reason})`,
        metadata: { movementId: result.movement.id },
        ipAddress: req.ip,
      });

      return res.status(201).send(result);
    } catch (error) {
      return res.status(500).send({ message: 'Failed to record stock movement' });
    }
  });

  // ─── GET /api/inventory/movements ─────────────────────────────────────────────
  app.get('/movements', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { supplierId, inventoryItemId, type, limit } = req.query;
    const take = Math.min(Number(limit) || 100, 500);

    try {
      const movements = await prisma.stockMovement.findMany({
        where: {
          ...(supplierId ? { supplierId: String(supplierId) } : {}),
          ...(inventoryItemId ? { inventoryItemId: String(inventoryItemId) } : {}),
          ...(type ? { type: String(type) } : {}),
        },
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return res.send(movements);
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── GET /api/inventory/suppliers ─────────────────────────────────────────────
  app.get('/suppliers', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    try {
      const suppliers = await prisma.supplier.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { stockMovements: true } },
        },
      });
      return res.send(suppliers);
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── POST /api/inventory/suppliers ────────────────────────────────────────────
  app.post('/suppliers', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { name, contactPerson, email, phone, address } = req.body;
    if (!name?.trim()) return res.status(422).send({ message: 'Supplier name is required' });

    try {
      const supplier = await prisma.supplier.create({
        data: {
          name: name.trim(),
          contactPerson: contactPerson?.trim() || null,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          address: address?.trim() || null,
        },
        include: {
          _count: { select: { stockMovements: true } },
        },
      });

      await logAuditEvent({
        eventType: 'supplier_created',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Create supplier',
        description: `Added supplier ${supplier.name}`,
        metadata: { supplierId: supplier.id },
        ipAddress: req.ip,
      });

      return res.status(201).send(supplier);
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  // ─── PUT /api/inventory/suppliers/:id ─────────────────────────────────────────
  app.put('/suppliers/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin', 'restaurant'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const { name, contactPerson, email, phone, address } = req.body;
    if (!name?.trim()) return res.status(422).send({ message: 'Supplier name is required' });

    const supplierId = req.params.id as string;

    try {
      const supplier = await prisma.supplier.update({
        where: { id: supplierId },
        data: {
          name: name.trim(),
          contactPerson: contactPerson?.trim() || null,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          address: address?.trim() || null,
        },
        include: {
          _count: { select: { stockMovements: true } },
        },
      });

      await logAuditEvent({
        eventType: 'supplier_updated',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Update supplier',
        description: `Updated supplier ${supplier.name}`,
        metadata: { supplierId: supplier.id },
        ipAddress: req.ip,
      });

      return res.send(supplier);
    } catch (error) {
      return res.status(500).send({ message: 'Supplier not found or update failed' });
    }
  });

  // ─── DELETE /api/inventory/suppliers/:id ──────────────────────────────────────
  app.delete('/suppliers/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    if (!['admin'].includes(req.user!.role)) {
      return res.status(403).send({ message: 'Not authorized' });
    }

    const supplierId = req.params.id as string;

    try {
      const movementCount = await prisma.stockMovement.count({
        where: { supplierId },
      });
      if (movementCount > 0) {
        return res.status(409).send({
          message: 'Cannot delete supplier with recorded purchases. Keep for audit history.',
        });
      }

      const supplier = await prisma.supplier.delete({ where: { id: supplierId } });

      await logAuditEvent({
        eventType: 'supplier_deleted',
        userType: req.user!.role,
        userId: req.user!.id,
        userName: req.user!.name,
        action: 'Delete supplier',
        description: `Removed supplier ${supplier.name}`,
        metadata: { supplierId: supplier.id },
        ipAddress: req.ip,
      });

      return res.send({ message: 'Supplier deleted' });
    } catch (error) {
      return res.status(500).send({ message: 'Supplier not found or delete failed' });
    }
  });
}

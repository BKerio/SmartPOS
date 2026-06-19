import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

// ─── GET /api/inventory/items ─────────────────────────────────────────────────
router.get('/items', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { category: 'asc' },
    });
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/inventory/items ────────────────────────────────────────────────
router.post('/items', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { name, category, unit, reorderLevel, unitCost } = req.body;
  if (!name || !category || !unit) {
    return res.status(422).json({ message: 'Name, category, and unit are required' });
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

    return res.status(201).json(item);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/inventory/movements ────────────────────────────────────────────
// Record stock coming in (purchases) or out (usage/spoilage)
router.post('/movements', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { inventoryItemId, type, quantity, reason, reference, notes, supplierId } = req.body;

  if (!inventoryItemId || !type || !quantity || !reason) {
    return res.status(422).json({ message: 'Required fields missing' });
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

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to record stock movement' });
  }
});

// ─── GET /api/inventory/suppliers ─────────────────────────────────────────────
router.get('/suppliers', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    return res.json(suppliers);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/inventory/suppliers ────────────────────────────────────────────
router.post('/suppliers', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { name, contactPerson, email, phone, address } = req.body;
  if (!name) return res.status(422).json({ message: 'Supplier name is required' });

  try {
    const supplier = await prisma.supplier.create({
      data: { name, contactPerson, email, phone, address },
    });
    return res.status(201).json(supplier);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

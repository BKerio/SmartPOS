import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAdmin, ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

const fmt = (m: any) => ({ ...m, _id: m.id });

// ─── GET /api/marketplace ─────────────────────────────────────────────────────
router.get('/', ensureAuthenticated, async (_req: Request, res: Response): Promise<any> => {
  try {
    const items = await prisma.marketplaceItem.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json(items.map(fmt));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/marketplace/:id ─────────────────────────────────────────────────
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const item = await prisma.marketplaceItem.findUnique({ where: { id: (req.params.id as string) } });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    return res.json(fmt(item));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/marketplace ────────────────────────────────────────────────────
router.post('/', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  const { title, description, price, imageUrl } = req.body;
  if (!title) return res.status(422).json({ message: 'Title is required' });
  try {
    const item = await prisma.marketplaceItem.create({
      data: { title, description, price: Number(price) || 0, imageUrl },
    });

    await logAuditEvent({
      eventType: 'marketplace_item_created',
      userType: req.user?.role || 'user',
      userId: req.user?.id,
      userName: req.user?.name || 'Unknown',
      action: 'Create Marketplace Item',
      description: `Created listing: ${title}`,
      ipAddress: req.ip,
    });

    return res.status(201).json(fmt(item));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/marketplace/:id ─────────────────────────────────────────────────
router.put('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  const { title, description, price, imageUrl } = req.body;
  try {
    const item = await prisma.marketplaceItem.update({
      where: { id: (req.params.id as string) },
      data: { title, description, price: price !== undefined ? Number(price) : undefined, imageUrl },
    });
    return res.json(fmt(item));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Item not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── DELETE /api/marketplace/:id ──────────────────────────────────────────────
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const item = await prisma.marketplaceItem.delete({ where: { id: (req.params.id as string) } });

    await logAuditEvent({
      eventType: 'marketplace_item_deleted',
      userType: req.user?.role || 'user',
      userId: req.user?.id,
      userName: req.user?.name || 'Unknown',
      action: 'Delete Marketplace Item',
      description: `Deleted listing: ${item.title}`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Item deleted' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Item not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

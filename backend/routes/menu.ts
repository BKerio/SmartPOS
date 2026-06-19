import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

// ─── GET /api/menu ────────────────────────────────────────────────────────────
router.get('/', ensureAuthenticated, async (_req: Request, res: Response): Promise<any> => {
  try {
    const items = await prisma.menuItem.findMany({
      where: { isAvailable: true },
      orderBy: { category: 'asc' },
    });
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/menu/all ────────────────────────────────────────────────────────
// Admin/Restaurant staff view including unavailable items
router.get('/all', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const items = await prisma.menuItem.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/menu ───────────────────────────────────────────────────────────
router.post('/', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { name, description, price, category, imageUrl, isAvailable } = req.body;
  if (!name || !price || !category) {
    return res.status(422).json({ message: 'Name, price, and category are required' });
  }

  try {
    const item = await prisma.menuItem.create({
      data: {
        name,
        description,
        price: Number(price),
        category,
        imageUrl,
        isAvailable: isAvailable ?? true,
      },
    });

    await logAuditEvent({
      eventType: 'menu_item_created',
      userType: req.user!.role,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Create Menu Item',
      description: `Added ${name} to the menu`,
      ipAddress: req.ip,
    });

    return res.status(201).json(item);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/menu/:id ────────────────────────────────────────────────────────
router.put('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { name, description, price, category, imageUrl, isAvailable } = req.body;

  try {
    const data: any = {};
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = Number(price);
    if (category) data.category = category;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (isAvailable !== undefined) data.isAvailable = isAvailable;

    const item = await prisma.menuItem.update({
      where: { id: req.params.id as string },
      data,
    });

    return res.json(item);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Menu item not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── DELETE /api/menu/:id ─────────────────────────────────────────────────────
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const item = await prisma.menuItem.delete({ where: { id: req.params.id as string } });

    await logAuditEvent({
      eventType: 'menu_item_deleted',
      userType: req.user!.role,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Delete Menu Item',
      description: `Removed ${item.name} from the menu`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Menu item deleted' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Menu item not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAdmin, ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

const fmt = (p: any) => ({ ...p, _id: p.id });

// ─── GET /api/properties ──────────────────────────────────────────────────────
router.get('/', ensureAuthenticated, async (_req: Request, res: Response): Promise<any> => {
  try {
    const properties = await prisma.property.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json(properties.map(fmt));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/properties/:id ──────────────────────────────────────────────────
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const property = await prisma.property.findUnique({ where: { id: (req.params.id as string) } });
    if (!property) return res.status(404).json({ message: 'Property not found' });
    return res.json(fmt(property));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/properties ─────────────────────────────────────────────────────
router.post('/', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { title, description, price, location, imageUrl } = req.body;
  if (!title) return res.status(422).json({ message: 'Title is required' });
  try {
    const property = await prisma.property.create({
      data: { title, description, price: Number(price) || 0, location, imageUrl },
    });

    await logAuditEvent({
      eventType: 'property_created',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Create Property',
      description: `Created property: ${title}`,
      ipAddress: req.ip,
    });

    return res.status(201).json(fmt(property));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/properties/:id ──────────────────────────────────────────────────
router.put('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { title, description, price, location, imageUrl } = req.body;
  try {
    const property = await prisma.property.update({
      where: { id: (req.params.id as string) },
      data: { title, description, price: price !== undefined ? Number(price) : undefined, location, imageUrl },
    });
    return res.json(fmt(property));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Property not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── DELETE /api/properties/:id ───────────────────────────────────────────────
router.delete('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const property = await prisma.property.delete({ where: { id: (req.params.id as string) } });

    await logAuditEvent({
      eventType: 'property_deleted',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Delete Property',
      description: `Deleted property: ${property.title}`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Property deleted' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Property not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

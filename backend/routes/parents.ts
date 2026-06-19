import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken, ensureAdmin, ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

const fmt = (p: any) => ({ ...p, _id: p.id });

// ─── GET /api/parents ─────────────────────────────────────────────────────────
router.get('/', ensureAdmin, async (_req: Request, res: Response): Promise<any> => {
  try {
    const parents = await prisma.parent.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, phone: true, createdAt: true,
        students: { select: { id: true, name: true, regNo: true } },
      },
    });
    return res.json(parents.map(fmt));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/parents ────────────────────────────────────────────────────────
router.post('/', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { name, email, phone, password, studentIds } = req.body;
  if (!name || !email || !password) {
    return res.status(422).json({ message: 'Name, email, and password are required' });
  }
  try {
    const existing = await prisma.parent.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'A parent with this email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const parent = await prisma.parent.create({
      data: { name, email, phone, password: hashed },
    });

    if (Array.isArray(studentIds) && studentIds.length > 0) {
      await prisma.student.updateMany({
        where: { id: { in: studentIds } },
        data: { parentId: parent.id },
      });
    }

    const result = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: {
        id: true, name: true, email: true, phone: true, createdAt: true,
        students: { select: { id: true, name: true, regNo: true } },
      },
    });

    await logAuditEvent({
      eventType: 'parent_created',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Create Parent',
      description: `Created parent account for ${name} (${email})`,
      ipAddress: req.ip,
    });

    return res.status(201).json(fmt(result));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/parents/register ───────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<any> => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) {
    return res.status(422).json({ message: 'Name, email, and password are required' });
  }

  try {
    const existing = await prisma.parent.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: 'A parent account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const parent = await prisma.parent.create({
      data: { name, email, phone, password: hashed },
      select: { id: true, name: true, email: true },
    });

    return res.status(201).json(parent);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/parents/login ──────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(422).json({ message: 'Email and password required' });

  try {
    const parent = await prisma.parent.findUnique({ where: { email } });
    if (!parent) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, parent.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken({ id: parent.id, email: parent.email, role: 'parent', name: parent.name });

    await logAuditEvent({
      eventType: 'login',
      userType: 'parent',
      userId: parent.id,
      userName: parent.name,
      userEmail: parent.email,
      action: 'Parent login',
      ipAddress: req.ip,
    });

    return res.json({ token, id: parent.id, name: parent.name, email: parent.email, role: 'parent' });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/parents/students ────────────────────────────────────────────────
// Get students linked to this parent
router.get('/students', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'parent') return res.status(403).json({ message: 'Not authorized' });

  try {
    const parent = await prisma.parent.findUnique({
      where: { id: req.user!.id },
      include: {
        students: {
          select: {
            id: true, name: true, regNo: true, course: true, walletBalance: true,
            transactions: { orderBy: { createdAt: 'desc' }, take: 5 }, // Last 5 transactions
          }
        }
      }
    });

    return res.json(parent?.students || []);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/parents/:id ─────────────────────────────────────────────────────
router.get('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const parent = await prisma.parent.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true, name: true, email: true, phone: true, createdAt: true,
        students: { select: { id: true, name: true, regNo: true, course: true, walletBalance: true } },
      },
    });
    if (!parent) return res.status(404).json({ message: 'Parent not found' });
    return res.json(fmt(parent));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/parents/:id ─────────────────────────────────────────────────────
router.put('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { name, email, phone, password, studentIds } = req.body;
  try {
    if (email) {
      const conflict = await prisma.parent.findFirst({
        where: { email, id: { not: req.params.id as string } },
      });
      if (conflict) return res.status(409).json({ message: 'Another parent uses this email' });
    }

    const data: any = {};
    if (name) data.name = name;
    if (email) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (password) data.password = await bcrypt.hash(password, 10);

    await prisma.parent.update({ where: { id: req.params.id as string }, data });

    if (Array.isArray(studentIds)) {
      await prisma.student.updateMany({ where: { parentId: req.params.id as string }, data: { parentId: null } });
      if (studentIds.length > 0) {
        await prisma.student.updateMany({
          where: { id: { in: studentIds } },
          data: { parentId: req.params.id as string },
        });
      }
    }

    const parent = await prisma.parent.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true, name: true, email: true, phone: true, createdAt: true,
        students: { select: { id: true, name: true, regNo: true } },
      },
    });

    await logAuditEvent({
      eventType: 'parent_updated',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Update Parent',
      description: `Updated parent ${parent?.name}`,
      ipAddress: req.ip,
    });

    return res.json(fmt(parent));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Parent not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── DELETE /api/parents/:id ──────────────────────────────────────────────────
router.delete('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.student.updateMany({ where: { parentId: req.params.id as string }, data: { parentId: null } });
    const parent = await prisma.parent.delete({ where: { id: req.params.id as string } });

    await logAuditEvent({
      eventType: 'parent_deleted',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Delete Parent',
      description: `Deleted parent ${parent.name} (${parent.email})`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Parent deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Parent not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

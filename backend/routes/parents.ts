import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken, ensureAdmin, ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';
import { buildWalletPinUpdate } from '@/services/walletPin';
import { sendParentWelcomeNotifications } from '@/services/parentWelcome';

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
  if (!name || !phone || !password) {
    return res.status(422).json({ message: 'Name, phone, and password are required' });
  }
  try {
    const existing = await prisma.parent.findUnique({ where: { phone } });
    if (existing) return res.status(409).json({ message: 'A parent with this phone already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const parent = await prisma.parent.create({
      data: { name, email: email?.trim() || null, phone: String(phone).trim(), password: hashed },
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
        id: true, name: true, email: true, phone: true, receiveSms: true, receiveEmail: true, createdAt: true,
        students: { select: { id: true, name: true, regNo: true } },
      },
    });

    if (result) {
      try {
        await sendParentWelcomeNotifications({
          parent: result,
          password: String(password),
          students: result.students.map((s) => ({ name: s.name, regNo: s.regNo })),
        });
      } catch (err: any) {
        console.error('Parent welcome notification error:', err?.message || err);
      }
    }

    await logAuditEvent({
      eventType: 'parent_created',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Create Parent',
      description: `Created parent account for ${name} (${String(phone).trim()})`,
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
  if (!name || !phone || !password) {
    return res.status(422).json({ message: 'Name, phone, and password are required' });
  }

  try {
    const existing = await prisma.parent.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({ message: 'A parent account with this phone already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const parent = await prisma.parent.create({
      data: { name, email: email?.trim() || null, phone: String(phone).trim(), password: hashed },
      select: { id: true, name: true, email: true, phone: true },
    });

    return res.status(201).json(parent);
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/parents/login ──────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(422).json({ message: 'Phone and password required' });

  try {
    const parent = await prisma.parent.findUnique({ where: { phone: String(phone).trim() } });
    if (!parent) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, parent.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken({ id: parent.id, phone: parent.phone || undefined, role: 'parent', name: parent.name });

    await logAuditEvent({
      eventType: 'login',
      userType: 'parent',
      userId: parent.id,
      userName: parent.name,
      userEmail: parent.email || undefined,
      action: 'Parent login',
      ipAddress: req.ip,
    });

    return res.json({ token, id: parent.id, name: parent.name, email: parent.email, phone: parent.phone, role: 'parent' });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/parents/profile ─────────────────────────────────────────────────
router.get('/profile', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'parent') return res.status(403).json({ message: 'Not authorized' });

  try {
    const parent = await prisma.parent.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        receiveSms: true,
        receiveEmail: true,
        createdAt: true,
        students: {
          select: {
            id: true,
            name: true,
            regNo: true,
            course: true,
            gender: true,
            walletBalance: true,
            parentRelationship: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!parent) return res.status(404).json({ message: 'Parent not found' });
    return res.json({ ...fmt(parent), role: 'parent' });
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/parents/profile ─────────────────────────────────────────────────
router.put('/profile', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'parent') return res.status(403).json({ message: 'Not authorized' });

  const { name, phone, receiveSms, receiveEmail, currentPassword, newPassword } = req.body;

  try {
    const parent = await prisma.parent.findUnique({ where: { id: req.user!.id } });
    if (!parent) return res.status(404).json({ message: 'Parent not found' });

    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (receiveSms !== undefined) data.receiveSms = Boolean(receiveSms);
    if (receiveEmail !== undefined) data.receiveEmail = Boolean(receiveEmail);

    if (newPassword) {
      if (!currentPassword) {
        return res.status(422).json({ message: 'Current password is required to set a new password' });
      }
      const isMatch = await bcrypt.compare(currentPassword, parent.password);
      if (!isMatch) {
        return res.status(422).json({ message: 'Current password is incorrect' });
      }
      if (String(newPassword).length < 7) {
        return res.status(422).json({ message: 'New password must be at least 7 characters' });
      }
      data.password = await bcrypt.hash(String(newPassword), 10);
    }

    const updated = await prisma.parent.update({
      where: { id: parent.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        receiveSms: true,
        receiveEmail: true,
        createdAt: true,
        students: {
          select: {
            id: true,
            name: true,
            regNo: true,
            course: true,
            gender: true,
            walletBalance: true,
            parentRelationship: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    await logAuditEvent({
      eventType: 'parent_profile_updated',
      userType: 'parent',
      userId: parent.id,
      userName: updated.name,
      userEmail: updated.email || undefined,
      action: 'Update Profile',
      ipAddress: req.ip,
    });

    return res.json({ ...fmt(updated), role: 'parent' });
  } catch {
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
            id: true, name: true, regNo: true, walletBalance: true,
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

// ─── GET /api/parents/students/:id/history ───────────────────────────────────
router.get('/students/:id/history', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'parent') return res.status(403).json({ message: 'Not authorized' });

  try {
    const studentId = req.params.id as string;
    const student = await prisma.student.findFirst({
      where: { id: studentId, parentId: req.user!.id },
      select: {
        id: true,
        name: true,
        regNo: true,
        walletBalance: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });

    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(student);
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/parents/students/:id/wallet-settings ────────────────────────────
router.get('/students/:id/wallet-settings', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'parent') return res.status(403).json({ message: 'Not authorized' });

  try {
    const studentId = req.params.id as string;
    const student = await prisma.student.findFirst({
      where: { id: studentId, parentId: req.user!.id },
      select: {
        id: true,
        name: true,
        regNo: true,
        walletFrozen: true,
        dailySpendLimit: true,
        weeklySpendLimit: true,
        walletPinSetAt: true,
      },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json({ ...student, pinEnabled: Boolean(student.walletPinSetAt) });
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/parents/students/:id/wallet-settings ────────────────────────────
router.put('/students/:id/wallet-settings', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'parent') return res.status(403).json({ message: 'Not authorized' });

  const { dailySpendLimit, weeklySpendLimit, walletFrozen, pin, resetPin } = req.body || {};

  const parseLimit = (v: any): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === '' || v === 'none') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error('INVALID_LIMIT');
    return n;
  };

  try {
    const studentId = req.params.id as string;
    const linked = await prisma.student.findFirst({
      where: { id: studentId, parentId: req.user!.id },
      select: { id: true, regNo: true, name: true },
    });
    if (!linked) return res.status(404).json({ message: 'Student not found' });

    const data: any = {};
    try {
      const d = parseLimit(dailySpendLimit);
      if (d !== undefined) data.dailySpendLimit = d;
      const w = parseLimit(weeklySpendLimit);
      if (w !== undefined) data.weeklySpendLimit = w;
    } catch {
      return res.status(422).json({ message: 'Invalid limit value' });
    }

    if (walletFrozen !== undefined) data.walletFrozen = Boolean(walletFrozen);

    try {
      const pinData = await buildWalletPinUpdate({ pin, resetPin });
      Object.assign(data, pinData);
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_PIN') {
        return res.status(422).json({ message: 'PIN must be exactly 4 digits' });
      }
      throw err;
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data,
      select: {
        id: true,
        name: true,
        regNo: true,
        walletFrozen: true,
        dailySpendLimit: true,
        weeklySpendLimit: true,
        walletPinSetAt: true,
      },
    });

    await logAuditEvent({
      eventType: 'wallet_settings_updated',
      userType: 'parent',
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'Update Wallet Settings',
      description: `Updated wallet settings for ${updated.name} (${updated.regNo})`,
      metadata: { studentId: updated.id },
      ipAddress: req.ip,
    });

    return res.json({ ...updated, pinEnabled: Boolean(updated.walletPinSetAt) });
  } catch {
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
        students: { select: { id: true, name: true, regNo: true, walletBalance: true } },
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
    if (phone) {
      const conflict = await prisma.parent.findFirst({
        where: { phone, id: { not: req.params.id as string } },
      });
      if (conflict) return res.status(409).json({ message: 'Another parent uses this phone' });
    }

    const data: any = {};
    if (name) data.name = name;
    if (email !== undefined) data.email = email?.trim() || null;
    if (phone !== undefined) data.phone = String(phone).trim();
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
      description: `Deleted parent ${parent.name} (${parent.phone})`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Parent deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Parent not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken, ensureAdmin } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

// ─── POST /api/admin/login ────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(422).json({ message: 'Email and password are required' });
  }

  try {
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken({ id: admin.id, email: admin.email, role: 'admin', name: admin.name });

    // Audit log
    await logAuditEvent({
      eventType: 'login',
      userType: 'admin',
      userId: admin.id,
      userName: admin.name,
      userEmail: admin.email,
      action: 'Admin login',
      description: `Admin ${admin.email} logged in`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      token,
      id: admin.id,
      _id: admin.id,
      name: admin.name,
      email: admin.email,
      role: 'admin',
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/admin/profile ───────────────────────────────────────────────────
router.get('/profile', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    return res.json({ ...admin, _id: admin.id, role: 'admin' });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/admin/profile ───────────────────────────────────────────────────
router.put('/profile', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { name, currentPassword, newPassword } = req.body;
  try {
    const admin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    let passwordHash = admin.password;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(422).json({ message: 'Current password is required to set a new password' });
      }
      const isMatch = await bcrypt.compare(currentPassword, admin.password);
      if (!isMatch) {
        return res.status(422).json({ message: 'Current password is incorrect' });
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.admin.update({
      where: { id: admin.id },
      data: { name: name || admin.name, password: passwordHash },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return res.json({ ...updated, _id: updated.id, role: 'admin' });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

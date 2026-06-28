import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';

const router = Router();

// ─── GET /api/auth/session ─────────────────────────────────────────────────────
// Validates JWT and confirms the account still exists in the database.
router.get('/session', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  const { id, role } = req.user!;

  try {
    switch (role) {
      case 'admin': {
        const admin = await prisma.admin.findUnique({
          where: { id },
          select: { id: true, name: true, email: true },
        });
        if (!admin) return res.status(401).json({ message: 'Session invalid' });
        return res.json({ user: { ...admin, role: 'admin' } });
      }
      case 'student': {
        const student = await prisma.student.findUnique({
          where: { id },
          select: { id: true, name: true, regNo: true, walletBalance: true },
        });
        if (!student) return res.status(401).json({ message: 'Session invalid' });
        return res.json({ user: { ...student, role: 'student' } });
      }
      case 'parent': {
        const parent = await prisma.parent.findUnique({
          where: { id },
          select: { id: true, name: true, email: true },
        });
        if (!parent) return res.status(401).json({ message: 'Session invalid' });
        return res.json({ user: { ...parent, role: 'parent' } });
      }
      case 'finance':
      case 'restaurant': {
        const user = await prisma.user.findUnique({
          where: { id },
          select: { id: true, name: true, email: true, role: true, status: true },
        });
        if (!user || user.role !== role) {
          return res.status(401).json({ message: 'Session invalid' });
        }
        if (user.status !== 'approved') {
          return res.status(403).json({ message: 'Account is not approved' });
        }
        return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
      }
      default:
        return res.status(401).json({ message: 'Session invalid' });
    }
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

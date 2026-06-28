import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '@/services/prisma';
import { ensureAuthenticated } from '@/middlewares/auth';
import { isMailConfigured, sendPasswordResetCode } from '@/services/mail';

const router = Router();

const CODE_TTL_MS = 5 * 60 * 1000;
const RESET_ROLES = ['student', 'parent'] as const;
type ResetRole = (typeof RESET_ROLES)[number];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

async function findAccount(email: string, role: ResetRole) {
  if (role === 'parent') {
    return prisma.parent.findUnique({ where: { email } });
  }
  return prisma.student.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
}

// ─── GET /api/auth/session ─────────────────────────────────────────────────────
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

// ─── POST /api/auth/forgot-password/request ───────────────────────────────────
router.post('/forgot-password/request', async (req: Request, res: Response): Promise<any> => {
  const { email, role } = req.body as { email?: string; role?: string };

  if (!email?.trim() || !role) {
    return res.status(422).json({ message: 'Email and account type are required' });
  }
  if (!RESET_ROLES.includes(role as ResetRole)) {
    return res.status(422).json({ message: 'Password reset is only available for students and parents' });
  }
  if (!isMailConfigured()) {
    return res.status(503).json({ message: 'Email service is not configured on the server' });
  }

  const normalized = normalizeEmail(email);
  const resetRole = role as ResetRole;

  try {
    const account = await findAccount(normalized, resetRole);

    if (account) {
      const recent = await prisma.passwordReset.count({
        where: {
          email: normalized,
          role: resetRole,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
      });
      if (recent >= 3) {
        return res.status(429).json({ message: 'Too many requests. Please try again later.' });
      }

      const code = generateCode();
      const codeHash = await bcrypt.hash(code, 10);

      await prisma.passwordReset.deleteMany({
        where: { email: normalized, role: resetRole, usedAt: null },
      });

      await prisma.passwordReset.create({
        data: {
          email: normalized,
          role: resetRole,
          codeHash,
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      });

      await sendPasswordResetCode(normalized, code, resetRole);
    }

    return res.json({
      message: 'If an account exists for this email, a 6-digit code has been sent. It expires in 5 minutes.',
    });
  } catch (err: any) {
    console.error('Forgot password request error:', err?.message || err);
    return res.status(500).json({ message: 'Could not send reset code. Please try again later.' });
  }
});

// ─── POST /api/auth/forgot-password/reset ─────────────────────────────────────
router.post('/forgot-password/reset', async (req: Request, res: Response): Promise<any> => {
  const { email, role, code, newPassword, confirmPassword } = req.body as {
    email?: string;
    role?: string;
    code?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  if (!email?.trim() || !role || !code || !newPassword || !confirmPassword) {
    return res.status(422).json({ message: 'All fields are required' });
  }
  if (!RESET_ROLES.includes(role as ResetRole)) {
    return res.status(422).json({ message: 'Invalid account type' });
  }
  if (!/^\d{6}$/.test(String(code).trim())) {
    return res.status(422).json({ message: 'Enter the 6-digit code from your email' });
  }
  if (newPassword.length < 7) {
    return res.status(422).json({ message: 'Password must be at least 7 characters' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(422).json({ message: 'Passwords do not match' });
  }

  const normalized = normalizeEmail(email);
  const resetRole = role as ResetRole;

  try {
    const account = await findAccount(normalized, resetRole);
    if (!account) {
      return res.status(422).json({ message: 'Invalid or expired reset code' });
    }

    const reset = await prisma.passwordReset.findFirst({
      where: {
        email: normalized,
        role: resetRole,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!reset) {
      return res.status(422).json({ message: 'Invalid or expired reset code' });
    }

    const codeOk = await bcrypt.compare(String(code).trim(), reset.codeHash);
    if (!codeOk) {
      return res.status(422).json({ message: 'Invalid or expired reset code' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    if (resetRole === 'parent') {
      await prisma.parent.update({
        where: { id: account.id },
        data: { password: passwordHash },
      });
    } else {
      await prisma.student.update({
        where: { id: account.id },
        data: { password: passwordHash },
      });
    }

    await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });

    await prisma.passwordReset.deleteMany({
      where: { email: normalized, role: resetRole, usedAt: null },
    });

    return res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err: any) {
    console.error('Forgot password reset error:', err?.message || err);
    return res.status(500).json({ message: 'Could not reset password. Please try again.' });
  }
});

export default router;

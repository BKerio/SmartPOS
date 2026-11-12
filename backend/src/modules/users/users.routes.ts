import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';

import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken, ensureAdmin, ensureAuthenticated } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';
import {
  FingerprintDuplicateError,
  assertFingerprintUnique,
  checkFingerprintUnique,
  fingerprintEnrollmentData,
  parseFingerprintTemplate,
} from '@/services/fingerprint';

const fmt = (u: any) => ({
  ...u,
  _id: u.id,
  hasFingerprint: Boolean(u.fingerprintTemplate || u.fingerprintEnrolledAt),
  fingerprintTemplate: undefined,
});

const userListSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  rejectionReason: true,
  fingerprintEnrolledAt: true,
  fingerprintTemplate: true,
  createdAt: true,
} as const;

// Roles an admin may assign. Self-registration (/register) stays limited to finance/restaurant.
const STAFF_ROLES = ['admin', 'finance', 'restaurant'];

export default async function usersRoutes(app: App) {
  
  // ─── POST /api/users (admin create) ───────────────────────────────────────────
  app.post('/', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { name, email, password, phone, role, status } = req.body;
  
    if (!name || !email || !password || !role) {
      return res.status(422).send({ message: 'Name, email, password and role are required' });
    }
  
    if (!STAFF_ROLES.includes(role)) {
      return res.status(422).send({ message: 'Role must be admin, finance or restaurant' });
    }
  
    try {
      const existing =
        (await prisma.user.findUnique({ where: { email } })) ||
        (await prisma.admin.findUnique({ where: { email } }));
      if (existing) return res.status(409).send({ message: 'An account with this email already exists' });
  
      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          name, email, password: hashed, phone, role,
          status: status === 'pending' ? 'pending' : 'approved',
        },
        select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
      });
  
      await logAuditEvent({
        eventType: 'user_created',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'Create Staff User',
        description: `Admin created ${role} account for ${name} (${email})`,
        metadata: { role },
        ipAddress: req.ip,
      });
  
      return res.status(201).send(fmt(user));
    } catch (error) {
      console.error(error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── POST /api/users/register ─────────────────────────────────────────────────
  app.post('/register', async (req: Req, res: FastifyReply): Promise<any> => {
    const { name, email, password, phone, role,  } = req.body;
  
    if (!name || !email || !password || !role) {
      return res.status(422).send({ message: 'Name, email, password and role are required' });
    }
  
    const allowedRoles = ['finance', 'restaurant'];
    if (!allowedRoles.includes(role)) {
      return res.status(422).send({ message: 'Invalid role' });
    }
  
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(409).send({ message: 'An account with this email already exists' });
      }
  
      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { name, email, password: hashed, phone, role,  status: 'pending' },
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      });
  
      await logAuditEvent({
        eventType: 'user_registered',
        userType: role,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: 'User Registration',
        description: `New ${role} account registered - pending admin approval`,
        metadata: { role },
        ipAddress: req.ip,
      });
  
      return res.status(201).send(fmt(user));
    } catch (error) {
      console.error(error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── POST /api/users/login ────────────────────────────────────────────────────
  app.post('/login', async (req: Req, res: FastifyReply): Promise<any> => {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(422).send({ message: 'Email and password are required' });
    }
  
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(401).send({ message: 'Invalid email or password' });
      }
      if (role && user.role !== role) {
        return res.status(401).send({ message: `No ${role} account found with this email` });
      }
      if (user.status !== 'approved') {
        const msgs: Record<string, string> = {
          pending: 'Your account is pending admin approval',
          rejected: 'Your account registration was rejected. Please contact the administrator for more information.',
        };
        return res.status(403).send({ message: msgs[user.status] || 'Account not active' });
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).send({ message: 'Invalid email or password' });
      }
  
      const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  
      await logAuditEvent({
        eventType: 'login',
        userType: user.role,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: 'User login',
        description: `${user.role} ${user.email} logged in`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
  
      return res.send({ token, id: user.id, _id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (error) {
      console.error(error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── GET /api/users ───────────────────────────────────────────────────────────
  app.get('/', { onRequest: ensureAdmin }, async (_req: Req, res: FastifyReply): Promise<any> => {
    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: userListSelect,
      });
      return res.send(users.map(fmt));
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── POST /api/users/check-fingerprint ────────────────────────────────────────
  app.post('/check-fingerprint', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { fingerprintTemplate, excludeUserId, biometric } = req.body;
    try {
      const template = parseFingerprintTemplate(fingerprintTemplate);
      if (!template) {
        return res.status(422).send({ message: 'fingerprintTemplate is required' });
      }
  
      const result = await checkFingerprintUnique(template, { userId: excludeUserId }, {
        biometric: biometric !== false,
      });
  
      if (!result.unique) {
        return res.status(409).send({
          unique: false,
          message: result.message,
          matchedStudent: result.matchedStudent,
          matchedUser: result.matchedUser,
        });
      }
  
      return res.send({ unique: true });
    } catch (err: any) {
      if (err instanceof FingerprintDuplicateError) {
        return res.status(409).send({
          unique: false,
          message: err.message,
          matchedStudent: err.matchedStudent,
          matchedUser: err.matchedUser,
        });
      }
      if (err?.message === 'INVALID_FINGERPRINT') {
        return res.status(422).send({ message: 'Invalid fingerprint template' });
      }
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── PUT /api/users/:id/fingerprint ───────────────────────────────────────────
  app.put('/:id/fingerprint', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { fingerprintTemplate } = req.body;
    try {
      const parsed = parseFingerprintTemplate(fingerprintTemplate);
      if (!parsed) {
        return res.status(422).send({ message: 'fingerprintTemplate is required' });
      }
  
      await assertFingerprintUnique(parsed, { userId: req.params.id as string });
  
      const user = await prisma.user.update({
        where: { id: req.params.id as string },
        data: fingerprintEnrollmentData(parsed),
        select: userListSelect,
      });
  
      await logAuditEvent({
        eventType: 'fingerprint_enrolled',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'Staff Fingerprint Enrolled',
        description: `Enrolled fingerprint for staff ${user.name} (${user.email})`,
        ipAddress: req.ip,
      });
  
      return res.send(fmt(user));
    } catch (err: any) {
      if (err instanceof FingerprintDuplicateError) {
        return res.status(409).send({ message: err.message, matchedUser: err.matchedUser, matchedStudent: err.matchedStudent });
      }
      if (err?.message === 'INVALID_FINGERPRINT') {
        return res.status(422).send({ message: 'Invalid fingerprint template' });
      }
      if (err.code === 'P2025') return res.status(404).send({ message: 'User not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── DELETE /api/users/:id/fingerprint ────────────────────────────────────────
  app.delete('/:id/fingerprint', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id as string },
        data: fingerprintEnrollmentData(null),
        select: userListSelect,
      });
  
      await logAuditEvent({
        eventType: 'fingerprint_removed',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'Staff Fingerprint Removed',
        description: `Removed fingerprint for staff ${user.name} (${user.email})`,
        ipAddress: req.ip,
      });
  
      return res.send(fmt(user));
    } catch (err: any) {
      if (err.code === 'P2025') return res.status(404).send({ message: 'User not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── GET /api/users/:id ───────────────────────────────────────────────────────
  // ─── GET /api/users/me ── staff (restaurant / finance) read their own account ────
  const selfSelect = {
    id: true, name: true, email: true, phone: true, role: true, status: true,
    fingerprintEnrolledAt: true, createdAt: true, updatedAt: true,
  } as const;

  app.get('/me', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: selfSelect });
    if (!me) return res.status(404).send({ message: 'Account not found' });
    return res.send({ ...me, _id: me.id, hasFingerprint: Boolean(me.fingerprintEnrolledAt) });
  });

  // ─── PUT /api/users/me ── update own name / phone, or change password ─────────
  // Email, role and approval stay with the admin. A new password needs the current one.
  app.put('/me', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { name, phone, currentPassword, newPassword } = (req.body ?? {}) as {
      name?: string; phone?: string | null; currentPassword?: string; newPassword?: string;
    };
    const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!me) return res.status(404).send({ message: 'Account not found' });

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(422).send({ message: 'Name is required' });
      data.name = name.trim();
    }
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (newPassword) {
      if (newPassword.length < 7) return res.status(422).send({ message: 'Use at least 7 characters for the new password' });
      if (!currentPassword) return res.status(422).send({ message: 'Enter your current password to set a new one' });
      if (!(await bcrypt.compare(currentPassword, me.password))) return res.status(422).send({ message: 'Current password is incorrect' });
      data.password = await bcrypt.hash(newPassword, 10);
    }
    if (Object.keys(data).length === 0) return res.status(422).send({ message: 'Nothing to update' });

    const updated = await prisma.user.update({ where: { id: me.id }, data, select: selfSelect });
    await logAuditEvent({
      eventType: newPassword ? 'password_changed' : 'profile_updated',
      userType: me.role,
      userId: me.id,
      userName: updated.name,
      action: newPassword ? 'Change Own Password' : 'Update Own Profile',
      description: `${updated.name} updated their ${[data.name && 'name', 'phone' in data && 'phone', data.password && 'password'].filter(Boolean).join(', ')}`,
      ipAddress: req.ip,
    });
    return res.send({ ...updated, _id: updated.id, hasFingerprint: Boolean(updated.fingerprintEnrolledAt) });
  });

  app.get('/:id', { onRequest: ensureAuthenticated }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: (req.params.id as string) },
        select: {
          id: true, name: true, email: true, phone: true,
          role: true, status: true, createdAt: true,
        },
      });
      if (!user) return res.status(404).send({ message: 'User not found' });
      return res.send(fmt(user));
    } catch {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── PUT /api/users/:id ───────────────────────────────────────────────────────
  app.put('/:id', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { name, email, phone, password, role, status } = req.body;
    try {
      if (email) {
        const conflict =
          (await prisma.user.findFirst({
            where: { email, id: { not: req.params.id as string } },
          })) || (await prisma.admin.findUnique({ where: { email } }));
        if (conflict) return res.status(409).send({ message: 'Another user uses this email' });
      }
  
      const data: any = {};
      if (name) data.name = name;
      if (email) data.email = email;
      if (phone !== undefined) data.phone = phone;
      if (role && STAFF_ROLES.includes(role)) data.role = role;
      if (status && ['pending', 'approved', 'rejected'].includes(status)) data.status = status;
      if (password) data.password = await bcrypt.hash(password, 10);
  
      const user = await prisma.user.update({
        where: { id: req.params.id as string },
        data,
        select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
      });
  
      await logAuditEvent({
        eventType: 'user_updated',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'Update Staff User',
        description: `Updated ${user.role} account for ${user.name}`,
        ipAddress: req.ip,
      });
  
      return res.send(fmt(user));
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'User not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── PATCH /api/users/:id/approve ─────────────────────────────────────────────
  app.patch('/:id/approve', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const user = await prisma.user.update({
        where: { id: (req.params.id as string) },
        data: { status: 'approved', rejectionReason: null },
        select: { id: true, name: true, email: true, role: true, status: true },
      });
  
      await logAuditEvent({
        eventType: 'user_approved',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'Approve User',
        description: `Approved ${user.role} account for ${user.name} (${user.email})`,
        ipAddress: req.ip,
      });
  
      return res.send(fmt(user));
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'User not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── PATCH /api/users/:id/reject ──────────────────────────────────────────────
  app.patch('/:id/reject', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { reason } = req.body;
    try {
      const user = await prisma.user.update({
        where: { id: (req.params.id as string) },
        data: { status: 'rejected', rejectionReason: reason || null },
        select: { id: true, name: true, email: true, role: true, status: true },
      });
  
      await logAuditEvent({
        eventType: 'user_rejected',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'Reject User',
        description: `Rejected ${user.role} account for ${user.name} (${user.email})`,
        metadata: { reason },
        ipAddress: req.ip,
      });
  
      return res.send(fmt(user));
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'User not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── DELETE /api/users/:id ────────────────────────────────────────────────────
  app.delete('/:id', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const user = await prisma.user.delete({ where: { id: (req.params.id as string) } });
  
      await logAuditEvent({
        eventType: 'user_deleted',
        userType: 'admin',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'Delete User',
        description: `Deleted user ${user.name} (${user.email})`,
        ipAddress: req.ip,
      });
  
      return res.send({ message: 'User deleted successfully' });
    } catch (error: any) {
      if (error.code === 'P2025') return res.status(404).send({ message: 'User not found' });
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
}

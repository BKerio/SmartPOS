import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';

import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken, ensureAdmin } from '@/middleware/auth';
import { logAuditEvent } from '@/services/audit';
import { sendParentWelcomeNotifications } from '@/services/parentWelcome';
import { isMailConfigured } from '@/services/mail';
import { isAdvantaSmsConfigured } from '@/services/sms';
import { getSystemSettings, setSystemSettings } from '@/services/systemSettings';

export default async function adminRoutes(app: App) {
  
  // ─── POST /api/admin/login ────────────────────────────────────────────────────
  app.post('/login', async (req: Req, res: FastifyReply): Promise<any> => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(422).send({ message: 'Email and password are required' });
    }
  
    try {
      const admin = await prisma.admin.findUnique({ where: { email } });
  
      if (!admin) {
        return res.status(401).send({ message: 'Invalid email or password' });
      }
  
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(401).send({ message: 'Invalid email or password' });
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
  
      return res.status(200).send({
        token,
        id: admin.id,
        _id: admin.id,
        name: admin.name,
        email: admin.email,
        role: 'admin',
      });
    } catch (error) {
      console.error('Admin login error:', error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── GET /api/admin/profile ───────────────────────────────────────────────────
  app.get('/profile', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const select = { id: true, name: true, email: true, createdAt: true };
      const admin =
        (await prisma.admin.findUnique({ where: { id: req.user!.id }, select })) ||
        (await prisma.user.findFirst({ where: { id: req.user!.id, role: 'admin' }, select }));
  
      if (!admin) return res.status(404).send({ message: 'Admin not found' });
  
      return res.send({ ...admin, _id: admin.id, role: 'admin' });
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── PUT /api/admin/profile ───────────────────────────────────────────────────
  app.put('/profile', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { name, currentPassword, newPassword } = req.body;
    try {
      const primaryAdmin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      const admin =
        primaryAdmin || (await prisma.user.findFirst({ where: { id: req.user!.id, role: 'admin' } }));
      if (!admin) return res.status(404).send({ message: 'Admin not found' });
  
      let passwordHash = admin.password;
      if (newPassword) {
        if (String(newPassword).length < 7) {
          return res.status(422).send({ message: 'Use at least 7 characters for the new password' });
        }
        if (!currentPassword) {
          return res.status(422).send({ message: 'Current password is required to set a new password' });
        }
        const isMatch = await bcrypt.compare(currentPassword, admin.password);
        if (!isMatch) {
          return res.status(422).send({ message: 'Current password is incorrect' });
        }
        passwordHash = await bcrypt.hash(newPassword, 10);
      }
  
      const args = {
        where: { id: admin.id },
        data: { name: name || admin.name, password: passwordHash },
        select: { id: true, name: true, email: true, createdAt: true },
      };
      const updated = primaryAdmin ? await prisma.admin.update(args) : await prisma.user.update(args);

      await logAuditEvent({
        eventType: newPassword ? 'password_changed' : 'profile_updated',
        userType: 'admin',
        userId: admin.id,
        userName: updated.name,
        action: newPassword ? 'Change Own Password' : 'Update Own Profile',
        description: newPassword ? `${updated.name} changed their password` : `${updated.name} updated their profile`,
        ipAddress: req.ip,
      });
  
      return res.send({ ...updated, _id: updated.id, role: 'admin' });
    } catch (error) {
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── GET /api/admin/settings ──────────────────────────────────────────────────
  // ─── GET /api/admin/dashboard ─────────────────────────────────────────────────
  // Every headline figure for the admin dashboard in one round trip, computed by the database
  // (counts and sums) instead of downloading whole tables to count them in the browser.
  app.get('/dashboard', { onRequest: ensureAdmin }, async (_req: Req, res: FastifyReply): Promise<any> => {
    try {
      const [students, wallets, enrolled, staff, pendingStaff, revenue, lowStockRows, openInvoices] = await Promise.all([
        prisma.student.count(),
        prisma.student.aggregate({ _sum: { walletBalance: true } }),
        prisma.student.count({ where: { fingerprintTemplate: { not: null } } }),
        prisma.user.count(),
        prisma.user.count({ where: { status: 'pending' } }),
        prisma.posTransaction.aggregate({ _sum: { totalAmount: true }, where: { status: 'completed' } }),
        prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM inventory_items WHERE "stockLevel" <= "reorderLevel"`,
        prisma.salesInvoice.aggregate({
          _count: true,
          _sum: { totalAmount: true, paidAmount: true },
          where: { status: { in: ['unpaid', 'partial'] } },
        }),
      ]);
      return res.send({
        students,
        walletTotal: wallets._sum.walletBalance ?? 0,
        fingerprintEnrolled: enrolled,
        staff,
        pendingStaff,
        revenue: revenue._sum.totalAmount ?? 0,
        lowStock: Number(lowStockRows[0]?.n ?? 0),
        openInvoices: openInvoices._count,
        invoicesOutstanding: (openInvoices._sum.totalAmount ?? 0) - (openInvoices._sum.paidAmount ?? 0),
      });
    } catch (error) {
      _req.log.error(error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });

  app.get('/settings', { onRequest: ensureAdmin }, async (_req: Req, res: FastifyReply): Promise<any> => {
    try {
      const settings = getSystemSettings();
      return res.send({
        ...settings,
        smsConfigured: isAdvantaSmsConfigured(),
      });
    } catch (error) {
      console.error('Admin settings get error:', error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── PUT /api/admin/settings ──────────────────────────────────────────────────
  app.put('/settings', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    try {
      const { smsDisabled } = req.body || {};
      if (typeof smsDisabled !== 'boolean') {
        return res.status(422).send({ message: 'smsDisabled (boolean) is required' });
      }
  
      const settings = setSystemSettings({ smsDisabled });
  
      await logAuditEvent({
        eventType: 'settings',
        userType: 'admin',
        userId: req.user!.id,
        userName: req.user!.name || req.user!.email || 'Admin',
        userEmail: req.user!.email,
        action: smsDisabled ? 'Disable SMS' : 'Enable SMS',
        description: smsDisabled
          ? 'Admin disabled system-wide SMS'
          : 'Admin enabled system-wide SMS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
  
      return res.send({
        ...settings,
        smsConfigured: isAdvantaSmsConfigured(),
      });
    } catch (error) {
      console.error('Admin settings put error:', error);
      return res.status(500).send({ message: 'Something went wrong' });
    }
  });
  
  // ─── POST /api/admin/notifications/test ───────────────────────────────────────
  app.post('/notifications/test', { onRequest: ensureAdmin }, async (req: Req, res: FastifyReply): Promise<any> => {
    const { email, phone, parentName, password, studentName, studentRegNo, dryRun } = req.body || {};
  
    const config = {
      mailConfigured: isMailConfigured(),
      smsConfigured: isAdvantaSmsConfigured(),
      smsDisabled: getSystemSettings().smsDisabled,
    };
  
    try {
      if (!email && !phone) {
        return res.status(422).send({ message: 'Provide at least email or phone', config });
      }
      if (!password) {
        return res.status(422).send({ message: 'password is required', config });
      }
  
      if (dryRun === true) {
        return res.send({
          ok: true,
          dryRun: true,
          config,
          wouldSend: {
            email: Boolean(email && config.mailConfigured),
            sms: Boolean(phone && config.smsConfigured && !config.smsDisabled),
          },
        });
      }
  
      const parent = {
        name: String(parentName || 'Test Parent'),
        email: String(email || ''),
        phone: phone ? String(phone) : null,
        receiveEmail: true,
        receiveSms: true,
      };
      const students = [{
        name: String(studentName || 'Test Student'),
        regNo: String(studentRegNo || 'TEST-001'),
      }];
  
      await sendParentWelcomeNotifications({
        parent,
        password: String(password),
        students,
      });
  
      return res.send({ ok: true, config });
    } catch (err: any) {
      return res.status(500).send({
        ok: false,
        config,
        error: err?.message || String(err),
      });
    }
  });
}

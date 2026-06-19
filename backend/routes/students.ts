import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken, ensureAdmin, ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

/** Map prisma student → frontend shape (uses _id for MongoDB compat) */
const fmt = (s: any) => ({ ...s, _id: s.id });

// ─── POST /api/students/login ─────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { regNo, password } = req.body;
  if (!regNo || !password) {
    return res.status(422).json({ message: 'Registration number and password are required' });
  }
  try {
    const student = await prisma.student.findUnique({ where: { regNo } });
    if (!student) {
      return res.status(401).json({ message: 'Invalid registration number or password' });
    }
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid registration number or password' });
    }

    const token = signToken({ id: student.id, regNo: student.regNo, role: 'student', name: student.name });

    await logAuditEvent({
      eventType: 'login',
      userType: 'student',
      userId: student.id,
      userName: student.name,
      userEmail: student.email,
      action: 'Student login',
      description: `Student ${student.regNo} logged in`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ token, id: student.id, _id: student.id, name: student.name, regNo: student.regNo });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/students ────────────────────────────────────────────────────────
router.get('/', ensureAdmin, async (_req: Request, res: Response): Promise<any> => {
  try {
    const students = await prisma.student.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, regNo: true, course: true, email: true, phone: true,
        gender: true, year: true, walletBalance: true, parentId: true, createdAt: true,
        parent: { select: { id: true, name: true, email: true } },
      },
    });
    return res.json(students.map(fmt));
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/students ───────────────────────────────────────────────────────
router.post('/', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { name, regNo, course, email, phone, gender, year, password, parentId } = req.body;
  if (!name || !regNo || !course || !email || !phone || !gender || !year || !password) {
    return res.status(422).json({ message: 'All fields are required' });
  }
  try {
    const existing = await prisma.student.findFirst({
      where: { OR: [{ regNo }, { email }] },
    });
    if (existing) {
      return res.status(409).json({ message: 'A student with this registration number or email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const student = await prisma.student.create({
      data: {
        name, regNo, course, email, phone, gender,
        year: Number(year), password: hashed,
        parentId: parentId || null,
      },
      select: {
        id: true, name: true, regNo: true, course: true, email: true, phone: true,
        gender: true, year: true, walletBalance: true, parentId: true, createdAt: true,
        parent: { select: { id: true, name: true, email: true } },
      },
    });

    await logAuditEvent({
      eventType: 'student_created',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Create Student',
      description: `Created student ${name} (${regNo})`,
      metadata: { regNo, email },
      ipAddress: req.ip,
    });

    return res.status(201).json(fmt(student));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/students/me ─────────────────────────────────────────────────────
router.get('/me', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (req.user!.role !== 'student') {
    return res.status(403).json({ message: 'Student access only' });
  }
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, regNo: true, course: true, email: true,
        phone: true, gender: true, year: true, walletBalance: true, createdAt: true,
      },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(fmt(student));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/students/lookup/:regNo ─────────────────────────────────────────
router.get('/lookup/:regNo', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const student = await prisma.student.findUnique({
      where: { regNo: req.params.regNo as string },
      select: { id: true, name: true, regNo: true, course: true, walletBalance: true },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(fmt(student));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/students/:id ────────────────────────────────────────────────────
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: (req.params.id as string) },
      select: { id: true, name: true, regNo: true, course: true, email: true, phone: true, gender: true, year: true, createdAt: true },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(fmt(student));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/students/:id ────────────────────────────────────────────────────
router.put('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { name, course, email, phone, gender, year, password, parentId } = req.body;
  try {
    const existing = await prisma.student.findFirst({
      where: {
        AND: [
          { id: { not: (req.params.id as string) } },
          { OR: [{ email }] },
        ],
      },
    });
    if (existing) {
      return res.status(409).json({ message: 'Another student already uses that email' });
    }

    const data: any = { name, course, email, phone, gender, year: year ? Number(year) : undefined };
    if (password) data.password = await bcrypt.hash(password, 10);
    if (parentId !== undefined) data.parentId = parentId || null;

    const student = await prisma.student.update({
      where: { id: (req.params.id as string) },
      data,
      select: {
        id: true, name: true, regNo: true, course: true, email: true, phone: true,
        gender: true, year: true, walletBalance: true, parentId: true, createdAt: true,
        parent: { select: { id: true, name: true, email: true } },
      },
    });

    await logAuditEvent({
      eventType: 'student_updated',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Update Student',
      description: `Updated student ${student.name} (${student.regNo})`,
      ipAddress: req.ip,
    });

    return res.json(fmt(student));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Student not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── DELETE /api/students/:id ─────────────────────────────────────────────────
router.delete('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const student = await prisma.student.delete({ where: { id: (req.params.id as string) } });

    await logAuditEvent({
      eventType: 'student_deleted',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Delete Student',
      description: `Deleted student ${student.name} (${student.regNo})`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Student deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Student not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

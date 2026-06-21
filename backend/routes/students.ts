import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken, ensureAdmin, ensureAuthenticated } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';
import {
  assertFingerprintUnique,
  checkFingerprintUnique,
  fingerprintEnrollmentData,
  FingerprintDuplicateError,
} from '@/services/fingerprint';

const router = Router();

/** Map prisma student → frontend shape (uses _id for MongoDB compat) */
const fmt = (s: any) => {
  const { fingerprintTemplate, ...rest } = s;
  return {
    ...rest,
    _id: s.id,
    hasFingerprint: Boolean(fingerprintTemplate),
  };
};

const studentListSelect = {
  id: true, name: true, regNo: true, phone: true,
  gender: true, walletBalance: true, parentId: true, createdAt: true,
  fingerprintTemplate: true, fingerprintEnrolledAt: true,
  parent: { select: { id: true, name: true, email: true } },
} as const;

const studentDetailSelect = {
  ...studentListSelect,
} as const;

const parseFingerprintTemplate = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('INVALID_FINGERPRINT');
  const trimmed = value.trim();
  if (!trimmed) return null;
  const buf = Buffer.from(trimmed, 'base64');
  if (buf.length < 32) throw new Error('INVALID_FINGERPRINT');
  return trimmed;
};

// ─── POST /api/students/check-fingerprint ─────────────────────────────────────
router.post('/check-fingerprint', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { fingerprintTemplate, excludeStudentId } = req.body;
  try {
    const template = parseFingerprintTemplate(fingerprintTemplate);
    if (!template) {
      return res.status(422).json({ message: 'fingerprintTemplate is required' });
    }
    const result = await checkFingerprintUnique(template, excludeStudentId || undefined);
    if (!result.unique) {
      return res.status(409).json({
        unique: false,
        message: result.message,
        matchedStudent: result.matchedStudent,
      });
    }
    return res.json({ unique: true });
  } catch {
    return res.status(422).json({ message: 'Invalid fingerprint template' });
  }
});

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
      userEmail: undefined,
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
      select: studentListSelect,
    });
    return res.json(students.map(fmt));
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/students ───────────────────────────────────────────────────────
router.post('/', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { name, regNo, phone, gender, password, parentId, fingerprintTemplate } = req.body;
  if (!name || !regNo || !phone || !gender || !password) {
    return res.status(422).json({ message: 'Name, registration number, phone, gender, and password are required' });
  }
  try {
    const existing = await prisma.student.findUnique({ where: { regNo } });
    if (existing) {
      return res.status(409).json({ message: 'A student with this registration number already exists' });
    }

    let parsedFingerprint: string | null = null;
    try {
      const parsed = parseFingerprintTemplate(fingerprintTemplate);
      if (parsed) parsedFingerprint = parsed;
    } catch {
      return res.status(422).json({ message: 'Invalid fingerprint template' });
    }

    if (parsedFingerprint) {
      try {
        await assertFingerprintUnique(parsedFingerprint);
      } catch (err) {
        if (err instanceof FingerprintDuplicateError) {
          return res.status(409).json({ message: err.message, matchedStudent: err.matchedStudent });
        }
        throw err;
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const student = await prisma.student.create({
      data: {
        name, regNo, phone, gender, password: hashed,
        parentId: parentId || null,
        ...fingerprintEnrollmentData(parsedFingerprint),
      },
      select: studentDetailSelect,
    });

    await logAuditEvent({
      eventType: 'student_created',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Create Student',
      description: `Created student ${name} (${regNo})${parsedFingerprint ? ' with fingerprint' : ''}`,
      metadata: { regNo, hasFingerprint: Boolean(parsedFingerprint) },
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
        id: true, name: true, regNo: true,
        phone: true, gender: true, walletBalance: true, createdAt: true,
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
      select: { id: true, name: true, regNo: true, walletBalance: true },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(fmt(student));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/students/:id/fingerprint ────────────────────────────────────────
router.put('/:id/fingerprint', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { fingerprintTemplate } = req.body;
  try {
    let parsed: string;
    try {
      const value = parseFingerprintTemplate(fingerprintTemplate);
      if (!value) {
        return res.status(422).json({ message: 'fingerprintTemplate is required' });
      }
      parsed = value;
    } catch {
      return res.status(422).json({ message: 'Invalid fingerprint template' });
    }

    try {
      await assertFingerprintUnique(parsed, req.params.id as string);
    } catch (err) {
      if (err instanceof FingerprintDuplicateError) {
        return res.status(409).json({ message: err.message, matchedStudent: err.matchedStudent });
      }
      throw err;
    }

    const student = await prisma.student.update({
      where: { id: req.params.id as string },
      data: fingerprintEnrollmentData(parsed),
      select: studentDetailSelect,
    });

    await logAuditEvent({
      eventType: 'fingerprint_enrolled',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Enroll Fingerprint',
      description: `Enrolled fingerprint for ${student.name} (${student.regNo})`,
      metadata: { studentId: student.id, regNo: student.regNo },
      ipAddress: req.ip,
    });

    return res.json(fmt(student));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Student not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── DELETE /api/students/:id/fingerprint ─────────────────────────────────────
router.delete('/:id/fingerprint', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const student = await prisma.student.update({
      where: { id: req.params.id as string },
      data: fingerprintEnrollmentData(null),
      select: studentDetailSelect,
    });

    await logAuditEvent({
      eventType: 'fingerprint_removed',
      userType: 'admin',
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'Remove Fingerprint',
      description: `Removed fingerprint for ${student.name} (${student.regNo})`,
      ipAddress: req.ip,
    });

    return res.json(fmt(student));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Student not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: (req.params.id as string) },
      select: { id: true, name: true, regNo: true, phone: true, gender: true, createdAt: true },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(fmt(student));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/students/:id ────────────────────────────────────────────────────
router.put('/:id', ensureAdmin, async (req: Request, res: Response): Promise<any> => {
  const { name, phone, gender, password, parentId, fingerprintTemplate } = req.body;
  try {
    const data: any = { name, phone, gender };
    if (password) data.password = await bcrypt.hash(password, 10);
    if (parentId !== undefined) data.parentId = parentId || null;

    if (fingerprintTemplate !== undefined) {
      try {
        const parsed = parseFingerprintTemplate(fingerprintTemplate);
        if (parsed === undefined) {
          return res.status(422).json({ message: 'Invalid fingerprint template' });
        }
        if (parsed) {
          try {
            await assertFingerprintUnique(parsed, req.params.id as string);
          } catch (err) {
            if (err instanceof FingerprintDuplicateError) {
              return res.status(409).json({ message: err.message, matchedStudent: err.matchedStudent });
            }
            throw err;
          }
        }
        Object.assign(data, fingerprintEnrollmentData(parsed));
      } catch {
        return res.status(422).json({ message: 'Invalid fingerprint template' });
      }
    }

    const student = await prisma.student.update({
      where: { id: (req.params.id as string) },
      data,
      select: studentDetailSelect,
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

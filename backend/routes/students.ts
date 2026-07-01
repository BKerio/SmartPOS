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
  id: true, name: true, regNo: true, phone: true, email: true,
  gender: true, dateOfBirth: true, course: true, parentRelationship: true,
  walletBalance: true, parentId: true, createdAt: true,
  fingerprintTemplate: true, fingerprintEnrolledAt: true,
  parent: { select: { id: true, name: true, email: true, phone: true, receiveSms: true, receiveEmail: true } },
} as const;

const studentDetailSelect = {
  ...studentListSelect,
} as const;

const posStudentSelect = {
  id: true,
  name: true,
  regNo: true,
  phone: true,
  walletBalance: true,
  walletFrozen: true,
  walletPinSetAt: true,
  fingerprintTemplate: true,
} as const;

function toPosStudent(student: {
  id: string;
  name: string;
  regNo: string;
  phone?: string | null;
  walletBalance: number;
  walletFrozen?: boolean;
  walletPinSetAt?: Date | null;
  fingerprintTemplate?: string | null;
}) {
  return {
    ...fmt(student),
    walletFrozen: Boolean(student.walletFrozen),
    pinEnabled: Boolean(student.walletPinSetAt),
    hasFingerprint: Boolean(student.fingerprintTemplate),
  };
}

function rankStudentSearch<T extends { name: string; regNo: string; phone?: string | null }>(
  students: T[],
  query: string,
): T[] {
  const lower = query.toLowerCase();
  return students
    .map((student) => {
      const reg = student.regNo.toLowerCase();
      const name = student.name.toLowerCase();
      const phone = (student.phone || '').toLowerCase();
      let score = 0;
      if (reg === lower) score = 100;
      else if (reg.startsWith(lower)) score = 80;
      else if (name.startsWith(lower)) score = 70;
      else if (phone.startsWith(lower)) score = 65;
      else if (reg.includes(lower)) score = 50;
      else if (name.includes(lower)) score = 40;
      else if (phone.includes(lower)) score = 30;
      return { student, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.student.name.localeCompare(b.student.name))
    .map(({ student }) => student);
}

const generateRegNo = async (): Promise<string> => {
  const year = new Date().getFullYear();
  for (let i = 0; i < 10; i++) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const regNo = `ADM-${year}-${suffix}`;
    const exists = await prisma.student.findUnique({ where: { regNo } });
    if (!exists) return regNo;
  }
  return `ADM-${year}-${Date.now()}`;
};

type ParentEnrollmentInput = {
  name?: string;
  phone?: string;
  email?: string;
  receiveSms?: boolean;
  receiveEmail?: boolean;
};

const resolveParentId = async (
  parentId: string | null | undefined,
  parentInfo: ParentEnrollmentInput | undefined,
  existingParentId?: string | null,
): Promise<string | null> => {
  if (parentId) return parentId;
  if (!parentInfo?.name?.trim() || !parentInfo?.phone?.trim()) {
    return existingParentId ?? null;
  }

  const phone = parentInfo.phone.trim();
  const email = parentInfo.email?.trim() || `parent-${phone.replace(/\D/g, '')}@school.local`;
  const parentData = {
    name: parentInfo.name.trim(),
    phone,
    email,
    receiveSms: parentInfo.receiveSms !== false,
    receiveEmail: parentInfo.receiveEmail !== false,
  };

  const existing = await prisma.parent.findUnique({ where: { email } });
  if (existing) {
    await prisma.parent.update({ where: { id: existing.id }, data: parentData });
    return existing.id;
  }

  const hashed = await bcrypt.hash(phone.slice(-6).padStart(6, '0') || 'parent1', 10);
  const created = await prisma.parent.create({ data: { ...parentData, password: hashed } });
  return created.id;
};

const parseDateOfBirth = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_DOB');
  return date;
};

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
  const { fingerprintTemplate, excludeStudentId, biometric } = req.body;
  try {
    const template = parseFingerprintTemplate(fingerprintTemplate);
    if (!template) {
      return res.status(422).json({ message: 'fingerprintTemplate is required' });
    }
    const result = await checkFingerprintUnique(template, excludeStudentId || undefined, {
      biometric: biometric !== false,
    });
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
  const {
    name, regNo, phone, email, gender, dateOfBirth, course, password,
    parentId, parentRelationship, parent: parentInfo, fingerprintTemplate,
  } = req.body;
  if (!name || !gender) {
    return res.status(422).json({ message: 'Name and gender are required' });
  }
  try {
    const finalRegNo = (regNo?.trim() || await generateRegNo());

    const existing = await prisma.student.findUnique({ where: { regNo: finalRegNo } });
    if (existing) {
      return res.status(409).json({ message: 'A student with this admission number already exists' });
    }

    let parsedDob: Date | null = null;
    try {
      const parsed = parseDateOfBirth(dateOfBirth);
      if (parsed) parsedDob = parsed;
    } catch {
      return res.status(422).json({ message: 'Invalid date of birth' });
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

    const finalParentId = await resolveParentId(parentId, parentInfo);
    const plainPassword = password || finalRegNo.slice(-6);
    const hashed = await bcrypt.hash(plainPassword, 10);
    const student = await prisma.student.create({
      data: {
        name,
        regNo: finalRegNo,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        gender,
        dateOfBirth: parsedDob,
        course: course?.trim() || null,
        parentRelationship: parentRelationship?.trim() || null,
        password: hashed,
        parentId: finalParentId,
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
      description: `Created student ${name} (${finalRegNo})${parsedFingerprint ? ' with fingerprint' : ''}`,
      metadata: { regNo: finalRegNo, hasFingerprint: Boolean(parsedFingerprint) },
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
        phone: true, gender: true, walletBalance: true, walletFrozen: true,
        dailySpendLimit: true, weeklySpendLimit: true, createdAt: true,
        walletPinSetAt: true, fingerprintTemplate: true,
      },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(fmt(student));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/students/search ─────────────────────────────────────────────────
router.get('/search', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!['admin', 'restaurant', 'finance'].includes(req.user!.role)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.json([]);
  }

  try {
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { regNo: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: posStudentSelect,
      take: 25,
    });

    const ranked = rankStudentSearch(students, query).slice(0, 8);
    return res.json(ranked.map(toPosStudent));
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
    const regNo = decodeURIComponent(req.params.regNo as string).trim();
    const student = await prisma.student.findFirst({
      where: { regNo: { equals: regNo, mode: 'insensitive' } },
      select: posStudentSelect,
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(toPosStudent(student));
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
  const {
    name, phone, email, gender, dateOfBirth, course, password,
    parentId, parentRelationship, parent: parentInfo, fingerprintTemplate,
  } = req.body;
  try {
    const current = await prisma.student.findUnique({
      where: { id: req.params.id as string },
      select: { parentId: true },
    });
    if (!current) return res.status(404).json({ message: 'Student not found' });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (email !== undefined) data.email = email?.trim() || null;
    if (gender !== undefined) data.gender = gender;
    if (course !== undefined) data.course = course?.trim() || null;
    if (parentRelationship !== undefined) data.parentRelationship = parentRelationship?.trim() || null;
    if (password) data.password = await bcrypt.hash(password, 10);

    if (dateOfBirth !== undefined) {
      try {
        data.dateOfBirth = parseDateOfBirth(dateOfBirth);
      } catch {
        return res.status(422).json({ message: 'Invalid date of birth' });
      }
    }

    if (parentId !== undefined || parentInfo) {
      data.parentId = await resolveParentId(parentId, parentInfo, current.parentId);
    }

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
    const id = req.params.id as string;

    const student = await prisma.$transaction(async (tx) => {
      await tx.walletTransaction.deleteMany({ where: { studentId: id } });

      const posTransactions = await tx.posTransaction.findMany({
        where: { studentId: id },
        select: { id: true },
      });
      if (posTransactions.length > 0) {
        await tx.posTransactionItem.deleteMany({
          where: { transactionId: { in: posTransactions.map((t) => t.id) } },
        });
        await tx.posTransaction.deleteMany({ where: { studentId: id } });
      }

      return tx.student.delete({ where: { id } });
    });

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
    if (error.code === 'P2003') {
      return res.status(409).json({ message: 'Cannot delete student: related records still exist' });
    }
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;

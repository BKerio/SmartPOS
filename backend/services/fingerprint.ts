import crypto from 'crypto';
import prisma from '@/services/prisma';

const SCANNER_URL = process.env.FINGERPRINT_SCANNER_URL || 'http://127.0.0.1:17890';
const SCANNER_TIMEOUT_MS = 15_000;

export class FingerprintDuplicateError extends Error {
  matchedStudent?: { id: string; name: string; regNo: string };

  constructor(message: string, matchedStudent?: { id: string; name: string; regNo: string }) {
    super(message);
    this.name = 'FingerprintDuplicateError';
    this.matchedStudent = matchedStudent;
  }
}

export const hashFingerprintTemplate = (templateBase64: string): string =>
  crypto.createHash('sha256').update(Buffer.from(templateBase64, 'base64')).digest('hex');

export const fingerprintEnrollmentData = (template: string | null) => {
  if (!template) {
    return {
      fingerprintTemplate: null,
      fingerprintTemplateHash: null,
      fingerprintEnrolledAt: null,
    };
  }
  return {
    fingerprintTemplate: template,
    fingerprintTemplateHash: hashFingerprintTemplate(template),
    fingerprintEnrolledAt: new Date(),
  };
};

const findBiometricDuplicate = async (
  template: string,
  others: { id: string; name: string; regNo: string; fingerprintTemplate: string }[],
): Promise<{ id: string; name: string; regNo: string } | null> => {
  if (others.length === 0) return null;

  try {
    const res = await fetch(`${SCANNER_URL}/check-duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template,
        candidates: others.map((o) => o.fingerprintTemplate),
      }),
      signal: AbortSignal.timeout(SCANNER_TIMEOUT_MS),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.warn('Fingerprint scanner duplicate check failed:', data.message);
      return null;
    }

    if (data.isDuplicate && typeof data.matchedIndex === 'number') {
      const matched = others[data.matchedIndex];
      if (matched) return { id: matched.id, name: matched.name, regNo: matched.regNo };
    }
  } catch (err) {
    console.warn('Fingerprint scanner unavailable for biometric duplicate check:', err);
  }

  return null;
};

/** Ensures template is not already assigned to another student (exact + biometric). */
export const assertFingerprintUnique = async (
  template: string,
  excludeStudentId?: string,
): Promise<void> => {
  const hash = hashFingerprintTemplate(template);

  const exactTemplateMatch = await prisma.student.findFirst({
    where: {
      fingerprintTemplate: template,
      ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}),
    },
    select: { id: true, name: true, regNo: true },
  });

  if (exactTemplateMatch) {
    throw new FingerprintDuplicateError(
      `This fingerprint is already enrolled for ${exactTemplateMatch.name} (${exactTemplateMatch.regNo})`,
      exactTemplateMatch,
    );
  }

  const exactMatch = await prisma.student.findFirst({
    where: {
      fingerprintTemplateHash: hash,
      ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}),
    },
    select: { id: true, name: true, regNo: true },
  });

  if (exactMatch) {
    throw new FingerprintDuplicateError(
      `This fingerprint is already enrolled for ${exactMatch.name} (${exactMatch.regNo})`,
      exactMatch,
    );
  }

  const others = await prisma.student.findMany({
    where: {
      fingerprintTemplate: { not: null },
      ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}),
    },
    select: {
      id: true,
      name: true,
      regNo: true,
      fingerprintTemplate: true,
    },
  });

  const biometricMatch = await findBiometricDuplicate(
    template,
    others as { id: string; name: string; regNo: string; fingerprintTemplate: string }[],
  );

  if (biometricMatch) {
    throw new FingerprintDuplicateError(
      `This fingerprint matches an existing enrollment for ${biometricMatch.name} (${biometricMatch.regNo})`,
      biometricMatch,
    );
  }
};

export const checkFingerprintUnique = async (
  template: string,
  excludeStudentId?: string,
): Promise<{ unique: true } | { unique: false; message: string; matchedStudent?: { id: string; name: string; regNo: string } }> => {
  try {
    await assertFingerprintUnique(template, excludeStudentId);
    return { unique: true };
  } catch (err) {
    if (err instanceof FingerprintDuplicateError) {
      return { unique: false, message: err.message, matchedStudent: err.matchedStudent };
    }
    throw err;
  }
};

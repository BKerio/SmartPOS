import crypto from 'crypto';
import prisma from '@/services/prisma';

export const getScannerUrl = (): string =>
  (process.env.FINGERPRINT_SCANNER_URL || 'http://127.0.0.1:17890').replace(/\/$/, '');

const SCANNER_URL = getScannerUrl();
const SCANNER_TIMEOUT_MS = 8_000;

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

export const parseFingerprintTemplate = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('INVALID_FINGERPRINT');
  const trimmed = value.trim();
  if (!trimmed) return null;
  const buf = Buffer.from(trimmed, 'base64');
  if (buf.length < 32) throw new Error('INVALID_FINGERPRINT');
  return trimmed;
};

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

/** Hash + exact DB match only (fast). */
export const checkFingerprintFast = async (
  template: string,
  excludeStudentId?: string,
): Promise<{ unique: true } | { unique: false; message: string; matchedStudent?: { id: string; name: string; regNo: string } }> => {
  try {
    await assertFingerprintUnique(template, excludeStudentId, { biometric: false });
    return { unique: true };
  } catch (err) {
    if (err instanceof FingerprintDuplicateError) {
      return { unique: false, message: err.message, matchedStudent: err.matchedStudent };
    }
    throw err;
  }
};

/** Ensures template is not already assigned to another student (exact + biometric). */
export const assertFingerprintUnique = async (
  template: string,
  excludeStudentId?: string,
  options?: { biometric?: boolean },
): Promise<void> => {
  const runBiometric = options?.biometric !== false;
  const hash = hashFingerprintTemplate(template);
  const exclude = excludeStudentId ? { id: { not: excludeStudentId } } : {};

  const [exactTemplateMatch, exactMatch] = await Promise.all([
    prisma.student.findFirst({
      where: { fingerprintTemplate: template, ...exclude },
      select: { id: true, name: true, regNo: true },
    }),
    prisma.student.findFirst({
      where: { fingerprintTemplateHash: hash, ...exclude },
      select: { id: true, name: true, regNo: true },
    }),
  ]);

  if (exactTemplateMatch) {
    throw new FingerprintDuplicateError(
      `This fingerprint is already enrolled for ${exactTemplateMatch.name} (${exactTemplateMatch.regNo})`,
      exactTemplateMatch,
    );
  }

  if (exactMatch) {
    throw new FingerprintDuplicateError(
      `This fingerprint is already enrolled for ${exactMatch.name} (${exactMatch.regNo})`,
      exactMatch,
    );
  }

  if (!runBiometric) return;

  const others = await prisma.student.findMany({
    where: {
      fingerprintTemplate: { not: null },
      ...exclude,
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
  options?: { biometric?: boolean },
): Promise<{ unique: true } | { unique: false; message: string; matchedStudent?: { id: string; name: string; regNo: string } }> => {
  try {
    await assertFingerprintUnique(template, excludeStudentId, options);
    return { unique: true };
  } catch (err) {
    if (err instanceof FingerprintDuplicateError) {
      return { unique: false, message: err.message, matchedStudent: err.matchedStudent };
    }
    throw err;
  }
};

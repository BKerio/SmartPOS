import API from "@/services/api";

const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, "") ?? "";
const SCANNER_URL =
  import.meta.env.VITE_FINGERPRINT_SCANNER_URL ||
  (apiBase ? `${apiBase}/api/fingerprint-scanner` : "http://127.0.0.1:17890");

const CAPTURE_TIMEOUT_SEC = 15;

export interface ScannerHealth {
  ok: boolean;
  deviceConnected: boolean;
  deviceCount: number;
  message?: string;
}

export async function checkScannerHealth(): Promise<ScannerHealth> {
  const res = await fetch(`${SCANNER_URL}/health`, { method: "GET" });
  if (!res.ok) throw new Error("Fingerprint scanner service is not running");
  return res.json();
}

/** Wake the scanner hardware before capture (call when enrollment form opens). */
export async function prepareScanner(): Promise<void> {
  try {
    const res = await fetch(`${SCANNER_URL}/prepare`, { method: "POST" });
    if (!res.ok) return;
    await res.json();
  } catch {
    /* non-fatal */
  }
}

export async function captureFingerprint(): Promise<string> {
  const res = await fetch(
    `${SCANNER_URL}/capture?timeout=${CAPTURE_TIMEOUT_SEC}`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok || !data.ok || !data.template) {
    throw new Error(data.message || "Failed to capture fingerprint");
  }
  return data.template as string;
}

export async function checkFingerprintDuplicate(
  template: string,
  excludeStudentId?: string,
  options?: { biometric?: boolean },
): Promise<{ unique: boolean; message?: string; matchedStudent?: { name: string; regNo: string } }> {
  try {
    const { data } = await API.post("/students/check-fingerprint", {
      fingerprintTemplate: template,
      excludeStudentId,
      biometric: options?.biometric !== false,
    });
    return data;
  } catch (e: any) {
    if (e.response?.status === 409) {
      return {
        unique: false,
        message: e.response.data?.message,
        matchedStudent: e.response.data?.matchedStudent,
      };
    }
    throw e;
  }
}

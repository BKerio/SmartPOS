const SCANNER_URL =
  import.meta.env.VITE_FINGERPRINT_SCANNER_URL || "http://127.0.0.1:17890";

export interface ScannerHealth {
  ok: boolean;
  deviceConnected: boolean;
  deviceCount: number;
  message?: string;
}

export interface CaptureResult {
  ok: boolean;
  template: string;
  size: number;
}

export async function checkScannerHealth(): Promise<ScannerHealth> {
  const res = await fetch(`${SCANNER_URL}/health`, { method: "GET" });
  if (!res.ok) throw new Error("Fingerprint scanner service is not running");
  return res.json();
}

export async function captureFingerprint(): Promise<string> {
  const res = await fetch(`${SCANNER_URL}/capture`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || !data.ok || !data.template) {
    throw new Error(data.message || "Failed to capture fingerprint");
  }
  return data.template as string;
}

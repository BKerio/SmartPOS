import type { FastifyReply } from 'fastify';
import type { App, Req } from '@/lib/http';
import { getScannerUrl } from '@/services/fingerprint';
import { ensureAdmin } from '@/middleware/auth';

const SCANNER_TIMEOUT_MS = 20_000;

const proxyToScanner = async (req: Req, res: FastifyReply, path: string, method: string) => {
  const scannerUrl = getScannerUrl();
  const qs = new URL(req.url, 'http://localhost').search;
  const url = `${scannerUrl}${path}${qs}`;

  try {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(SCANNER_TIMEOUT_MS),
    };

    if (method !== 'GET' && method !== 'HEAD') {
      const hasBody = req.body && Object.keys(req.body).length > 0;
      if (hasBody) {
        init.body = JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(url, init);
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).send(data);
  } catch (err: any) {
    res.status(503).send({
      ok: false,
      message: `Fingerprint scanner unreachable at ${scannerUrl}. Ensure the service is running on the enrollment PC.`,
      detail: err?.message,
    });
  }
};

export default async function fingerprintScannerRoutes(app: App) {

  app.get('/health', (req, res) => proxyToScanner(req, res, '/health', 'GET'));
  // Lock down scanner operations to admins (fingerprint templates are sensitive).
  app.post('/prepare', { onRequest: ensureAdmin }, (req, res) => proxyToScanner(req, res, '/prepare', 'POST'));
  app.post('/capture', { onRequest: ensureAdmin }, (req, res) => proxyToScanner(req, res, '/capture', 'POST'));
  app.post('/check-duplicate', { onRequest: ensureAdmin }, (req, res) => proxyToScanner(req, res, '/check-duplicate', 'POST'));
}

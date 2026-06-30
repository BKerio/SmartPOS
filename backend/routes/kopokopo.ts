import express, { Request, Response } from 'express';
import prisma from '@/services/prisma';
import {
  initiateSTKPush,
  getPaymentStatus,
  subscribeWebhook,
  validateWebhookSignature,
} from '@/services/kopokopo.service';
import 'dotenv/config';

const router = express.Router();

const SUCCESS_STATUSES = new Set(['success', 'received', 'complete', 'completed', 'paid']);

const mapStatus = (kopoStatus: string): string => {
  const s = (kopoStatus || '').toLowerCase();
  if (SUCCESS_STATUSES.has(s)) return 'success';
  if (s === 'failed' || s === 'error') return 'failed';
  if (s === 'reversed') return 'reversed';
  if (s === 'pending' || s === 'processing' || s === 'request sent') return 'pending';
  return 'pending';
};

function isSuccessStatus(status: string): boolean {
  return mapStatus(status) === 'success';
}

function normalizeLocation(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

function locationId(url: string): string | null {
  const normalized = normalizeLocation(url);
  if (!normalized) return null;
  const parts = normalized.split('/');
  return parts[parts.length - 1] || null;
}

interface ParsedKopoPayload {
  status: string;
  rawStatus: string;
  amount: number;
  currency: string;
  phone: string;
  reference: string;
  transactionReference: string;
  location: string;
  originationTime: string;
  tillNumber: string;
  studentId?: string;
  paymentId?: string;
}

function parseKopoPayload(payload: any): ParsedKopoPayload {
  const data = payload?.data ?? payload;
  const attrs = data?.attributes ?? {};
  const resource = attrs?.event?.resource ?? {};
  const links = attrs?._links ?? data?._links ?? {};
  const metadata = attrs?.metadata ?? {};

  const rawStatus = String(resource.status || attrs.status || '');
  const amountRaw = resource.amount ?? attrs.amount?.value ?? attrs.amount ?? 0;

  return {
    status: mapStatus(rawStatus),
    rawStatus,
    amount: Number(amountRaw) || 0,
    currency: resource.currency ?? attrs.amount?.currency ?? 'KES',
    phone: String(resource.sender_phone_number ?? attrs.sender_phone_number ?? attrs.phone_number ?? ''),
    reference: String(data?.id ?? attrs.id ?? resource.id ?? ''),
    transactionReference: String(resource.reference ?? attrs.reference ?? attrs.mpesa_receipt_number ?? ''),
    location: normalizeLocation(String(links.self ?? '')),
    originationTime: String(resource.origination_time ?? attrs.origination_time ?? attrs.initiation_time ?? ''),
    tillNumber: String(resource.till_number ?? attrs.till_number ?? process.env.KOPOKOPO_TILL_NUMBER ?? ''),
    studentId: String(metadata.student_id ?? metadata.studentId ?? metadata.customer_id ?? '').trim() || undefined,
    paymentId: String(metadata.payment_id ?? metadata.paymentId ?? '').trim() || undefined,
  };
}

async function findKopoPayment(parsed: ParsedKopoPayload, hintLocation?: string) {
  const candidates = [
    normalizeLocation(hintLocation || ''),
    parsed.location,
    hintLocation || '',
  ].filter(Boolean);

  for (const loc of candidates) {
    const payment = await prisma.kopoPayment.findUnique({ where: { location: loc } });
    if (payment) return payment;
  }

  if (parsed.paymentId) {
    const payment = await prisma.kopoPayment.findUnique({ where: { id: parsed.paymentId } });
    if (payment) return payment;
  }

  const refIds = [parsed.reference, ...candidates.map(locationId)].filter(Boolean) as string[];
  for (const ref of refIds) {
    const payment = await prisma.kopoPayment.findUnique({ where: { reference: ref } });
    if (payment) return payment;
    const byLocation = await prisma.kopoPayment.findFirst({
      where: { location: { contains: ref } },
      orderBy: { createdAt: 'desc' },
    });
    if (byLocation) return byLocation;
  }

  return null;
}

async function creditStudentWallet(
  paymentId: string,
  studentId: string,
  amount: number,
  phone: string,
  reference: string,
) {
  if (!studentId || amount <= 0) {
    console.warn('[Kopokopo] Skip wallet credit — missing studentId or invalid amount', {
      paymentId,
      studentId,
      amount,
    });
    return false;
  }

  try {
    const payment = await prisma.kopoPayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.walletCredited) return false;

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new Error(`Student not found: ${studentId}`);
    }

    const claimed = await prisma.kopoPayment.updateMany({
      where: { id: paymentId, walletCredited: false },
      data: { walletCredited: true },
    });
    if (claimed.count === 0) return false;

    try {
      await prisma.student.update({
        where: { id: studentId },
        data: { walletBalance: { increment: amount } },
      });

      await prisma.walletTransaction.create({
        data: {
          studentId,
          amount,
          type: 'deposit',
          reference,
          description: `KopoKopo top-up from ${phone || 'M-Pesa'}`,
        },
      });
    } catch (creditErr) {
      await prisma.kopoPayment.update({
        where: { id: paymentId },
        data: { walletCredited: false },
      });
      throw creditErr;
    }

    console.log(`[Kopokopo] Credited student ${studentId} wallet with KES ${amount}`);
    return true;
  } catch (err: any) {
    console.error('[Kopokopo] Wallet credit failed:', err?.message || err);
    return false;
  }
}

async function applyPaymentUpdate(
  existing: { id: string; studentId: string | null; amount: number; phone: string; walletCredited: boolean },
  parsed: ParsedKopoPayload,
) {
  const studentId = existing.studentId || parsed.studentId || null;
  const creditAmount = parsed.amount > 0 ? parsed.amount : existing.amount;

  const payment = await prisma.kopoPayment.update({
    where: { id: existing.id },
    data: {
      reference: parsed.reference || undefined,
      location: parsed.location || undefined,
      status: parsed.status,
      amount: creditAmount,
      currency: parsed.currency,
      phone: parsed.phone || existing.phone,
      tillNumber: parsed.tillNumber,
      transactionReference: parsed.transactionReference,
      originationTime: parsed.originationTime || undefined,
      studentId,
    },
  });

  if (isSuccessStatus(parsed.rawStatus) && studentId && !payment.walletCredited) {
    await creditStudentWallet(
      payment.id,
      studentId,
      creditAmount,
      payment.phone,
      parsed.transactionReference || parsed.reference || payment.id,
    );
  }

  return prisma.kopoPayment.findUnique({ where: { id: payment.id } });
}

function emitKopokopoUpdate(req: Request, payload: Record<string, unknown>) {
  const io = req.app.get('io');
  if (!io) return;

  io.emit('kopokopo_update', payload);

  const location = payload.location as string | undefined;
  if (location) {
    io.to(location).emit('kopokopo_update', payload);
  }
}

// POST /api/kopokopo/stkpush
router.post('/stkpush', async (req: Request, res: Response) => {
  const { phone, amount, description, studentId } = req.body as {
    phone: string;
    amount: number;
    description?: string;
    studentId?: string;
  };

  if (!phone || !amount) {
    res.status(400).json({ error: 'phone and amount are required' });
    return;
  }

  if (!studentId) {
    res.status(422).json({ error: 'studentId is required to credit a wallet' });
    return;
  }

  try {
    console.log('[Kopokopo] Initiating STK Push →', { phone, amount, studentId });

    const pending = await prisma.kopoPayment.create({
      data: {
        status: 'pending',
        amount,
        phone,
        studentId,
        description: description || 'SmartPOS Wallet Top-up',
      },
    });

    const { location: rawLocation } = await initiateSTKPush({
      phone,
      amount,
      description: description || 'SmartPOS Wallet Top-up',
      studentId,
      paymentId: pending.id,
    });

    const location = normalizeLocation(rawLocation);
    const reference = locationId(location);

    const payment = await prisma.kopoPayment.update({
      where: { id: pending.id },
      data: {
        location,
        reference: reference || undefined,
      },
    });

    console.log('[Kopokopo] STK Push queued. Location:', location);
    res.status(201).json({ location, paymentId: payment.id });
  } catch (err: any) {
    console.error('[Kopokopo] STK Push Error:', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Kopokopo STK Push failed',
      details: err?.response?.data || err.message,
    });
  }
});

// GET /api/kopokopo/status?location=...
router.get('/status', async (req: Request, res: Response) => {
  const location = req.query.location as string;

  if (!location) {
    res.status(400).json({ error: 'location query param is required' });
    return;
  }

  try {
    const statusData = await getPaymentStatus(location);
    const parsed: ParsedKopoPayload = {
      ...parseKopoPayload(statusData.raw ?? {}),
      rawStatus: statusData.status,
      status: mapStatus(statusData.status),
      amount: statusData.amount || 0,
      currency: statusData.currency || 'KES',
      phone: statusData.phone || '',
      reference: String(statusData.reference || ''),
      transactionReference: String(statusData.reference || ''),
      location: normalizeLocation(location),
      originationTime: statusData.originationTime || '',
      tillNumber: process.env.KOPOKOPO_TILL_NUMBER || '',
    };

    let payment = await findKopoPayment(parsed, location);

    if (payment && isSuccessStatus(statusData.status)) {
      payment = await applyPaymentUpdate(payment, parsed);
    } else if (payment) {
      payment = await prisma.kopoPayment.update({
        where: { id: payment.id },
        data: { status: parsed.status },
      });
    }

    res.json({
      status: parsed.status,
      rawStatus: statusData.status,
      amount: parsed.amount || payment?.amount,
      currency: parsed.currency,
      reference: parsed.reference,
      transactionReference: payment?.transactionReference || parsed.transactionReference,
      phone: payment?.phone || parsed.phone,
      paymentId: payment?.id,
      studentId: payment?.studentId,
      walletCredited: payment?.walletCredited ?? false,
    });
  } catch (err: any) {
    console.error('[Kopokopo] Status Check Error:', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to fetch Kopokopo payment status',
      details: err?.response?.data || err.message,
    });
  }
});

// POST /api/kopokopo/payment/callback
router.post('/payment/callback', async (req: Request, res: Response) => {
  const signature = req.headers['x-kopokopo-signature'] as string;
  const rawBody = (req as any).rawBody as Buffer;

  if (signature && rawBody) {
    const valid = validateWebhookSignature(rawBody, signature);
    if (!valid) {
      console.warn('[Kopokopo] Invalid webhook signature!');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  const payload = req.body;
  console.log('[Kopokopo] Payment Callback received:', JSON.stringify(payload, null, 2));

  try {
    const parsed = parseKopoPayload(payload);
    let payment = await findKopoPayment(parsed);

    if (payment) {
      payment = await applyPaymentUpdate(payment, parsed);
    } else if (parsed.location || parsed.reference) {
      payment = await prisma.kopoPayment.create({
        data: {
          reference: parsed.reference || undefined,
          location: parsed.location || undefined,
          status: parsed.status,
          amount: parsed.amount,
          currency: parsed.currency,
          phone: parsed.phone,
          tillNumber: parsed.tillNumber,
          transactionReference: parsed.transactionReference,
          originationTime: parsed.originationTime || undefined,
          studentId: parsed.studentId || null,
          description: 'SmartPOS Payment',
          rawPayload: payload,
        },
      });

      if (isSuccessStatus(parsed.rawStatus) && payment.studentId && !payment.walletCredited) {
        await creditStudentWallet(
          payment.id,
          payment.studentId,
          payment.amount,
          payment.phone,
          parsed.transactionReference || parsed.reference || payment.id,
        );
        payment = await prisma.kopoPayment.findUnique({ where: { id: payment.id } });
      }
    }

    emitKopokopoUpdate(req, {
      paymentId: payment?.id,
      location: payment?.location || parsed.location,
      reference: parsed.reference,
      status: parsed.status,
      amount: payment?.amount ?? parsed.amount,
      currency: parsed.currency,
      phone: payment?.phone ?? parsed.phone,
      transactionReference: parsed.transactionReference,
      originationTime: parsed.originationTime,
      studentId: payment?.studentId,
      walletCredited: payment?.walletCredited ?? false,
    });

    res.status(200).json({ message: 'Callback processed successfully' });
  } catch (err: any) {
    console.error('[Kopokopo] Callback processing error:', err.message);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

// POST /api/kopokopo/webhooks
router.post('/webhooks', async (req: Request, res: Response) => {
  const signature = req.headers['x-kopokopo-signature'] as string;
  const rawBody = (req as any).rawBody as Buffer;

  if (signature && rawBody) {
    const valid = validateWebhookSignature(rawBody, signature);
    if (!valid) {
      console.warn('[Kopokopo] Invalid webhook signature on /webhooks');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  const payload = req.body;
  const eventType: string = payload?.topic ?? payload?.event?.type ?? 'unknown';
  console.log(`[Kopokopo] Webhook event: ${eventType}`, JSON.stringify(payload, null, 2));

  try {
    const io = req.app.get('io');
    if (io) {
      io.emit('kopokopo_webhook', { eventType, payload });
    }

    if (
      eventType === 'buygoods_transaction_received' ||
      eventType === 'b2b_transaction_received'
    ) {
      const parsed = parseKopoPayload(payload);
      parsed.status = 'success';
      parsed.rawStatus = 'Received';

      let payment = await findKopoPayment(parsed);

      if (payment) {
        payment = await applyPaymentUpdate(payment, parsed);
      } else {
        payment = await prisma.kopoPayment.create({
          data: {
            reference: parsed.reference || undefined,
            status: 'success',
            amount: parsed.amount,
            currency: parsed.currency,
            phone: parsed.phone,
            eventType,
            transactionReference: parsed.transactionReference,
            studentId: parsed.studentId || null,
            description: 'SmartPOS Payment',
            rawPayload: payload,
          },
        });

        if (payment.studentId && !payment.walletCredited) {
          await creditStudentWallet(
            payment.id,
            payment.studentId,
            payment.amount,
            payment.phone,
            parsed.transactionReference || parsed.reference || payment.id,
          );
          payment = await prisma.kopoPayment.findUnique({ where: { id: payment.id } });
        }
      }

      emitKopokopoUpdate(req, {
        paymentId: payment?.id,
        reference: parsed.reference,
        status: 'success',
        amount: payment?.amount,
        currency: parsed.currency,
        phone: payment?.phone,
        studentId: payment?.studentId,
        walletCredited: payment?.walletCredited ?? false,
      });
    }

    res.status(200).json({ message: 'Webhook received' });
  } catch (err: any) {
    console.error('[Kopokopo] Webhook handling error:', err.message);
    res.status(500).json({ error: 'Webhook handling failed' });
  }
});

// POST /api/kopokopo/subscribe-webhooks
router.post('/subscribe-webhooks', async (_req: Request, res: Response) => {
  const webhookUrl = process.env.KOPOKOPO_WEBHOOK_URL;
  if (!webhookUrl) {
    res.status(400).json({ error: 'KOPOKOPO_WEBHOOK_URL is not configured' });
    return;
  }

  const eventTypes = [
    'buygoods_transaction_received',
    'buygoods_transaction_reversed',
    'settlement_transfer_completed',
    'customer_created',
  ];

  const results: Record<string, string> = {};

  for (const eventType of eventTypes) {
    try {
      const location = await subscribeWebhook(eventType, webhookUrl);
      results[eventType] = location || 'subscribed';
      console.log(`[Kopokopo] Subscribed to ${eventType}:`, location);
    } catch (err: any) {
      results[eventType] = `error: ${err?.response?.data?.message || err.message}`;
      console.error(`[Kopokopo] Failed to subscribe to ${eventType}:`, err?.response?.data || err.message);
    }
  }

  res.json({ message: 'Webhook subscription complete', results });
});

// POST /api/kopokopo/reconcile — manually credit any successful but uncredited payments
router.post('/reconcile', async (_req: Request, res: Response) => {
  try {
    const pending = await prisma.kopoPayment.findMany({
      where: {
        walletCredited: false,
        studentId: { not: null },
        status: 'success',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const results = [];
    for (const payment of pending) {
      const ok = await creditStudentWallet(
        payment.id,
        payment.studentId!,
        payment.amount,
        payment.phone,
        payment.transactionReference || payment.reference || payment.id,
      );
      results.push({ paymentId: payment.id, credited: ok });
    }

    res.json({ reconciled: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kopokopo/transactions
router.get('/transactions', async (_req: Request, res: Response) => {
  try {
    const transactions = await prisma.kopoPayment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(transactions);
  } catch {
    res.status(500).json({ error: 'Failed to fetch Kopokopo transactions' });
  }
});

export default router;

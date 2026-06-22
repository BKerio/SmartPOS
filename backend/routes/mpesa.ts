import express, { Request, Response } from 'express';
import axios from 'axios';
import prisma from '@/services/prisma';
import 'dotenv/config';

const router = express.Router();

const {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_SHORTCODE,
  MPESA_PASSKEY,
  TILL_NO,
  MPESA_TRANSACTIONTYPE,
  MPESA_CALLBACK_URL,
  MPESA_BASE_URL,
} = process.env;

const formatPhoneNumber = (phone: string): string => {
  if (phone.startsWith('+')) return phone.replace('+', '');
  if (phone.startsWith('0')) return '254' + phone.substring(1);
  return phone;
};

const getAccessToken = async (): Promise<string> => {
  try {
    const response = await axios.get(
      `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        auth: {
          username: MPESA_CONSUMER_KEY!,
          password: MPESA_CONSUMER_SECRET!,
        },
      }
    );
    return response.data['access_token'] as string;
  } catch (err: any) {
    console.error('Failed to obtain M-Pesa access token:', err?.response?.data || err.message);
    throw err;
  }
};

// POST /api/stkpush
router.post('/stkpush', async (req: Request, res: Response) => {
  console.log('--- STK Push Initiated ---');
  console.log('Sending with Callback URL:', MPESA_CALLBACK_URL);
  const { phone, amount } = req.body as { phone: string; amount: number };

  try {
    const formattedPhone = formatPhoneNumber(phone);
    const accessToken = await getAccessToken();

    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - tzOffset);
    const timestamp = localDate.toISOString().replace(/[^0-9]/g, '').slice(0, 14);

    const password = Buffer.from(
      `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const payload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: MPESA_TRANSACTIONTYPE,
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: TILL_NO,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: 'Online Payment',
      TransactionDesc: 'Online Payment',
    };

    const stkResponse = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.status(200).json(stkResponse.data);
  } catch (error: any) {
    console.error('STK Push Error:', error?.response?.data || error.message);
    res.status(500).json({
      error: 'STK Push failed',
      details: error.response?.data || error.message,
    });
  }
});

// POST /api/stkpush/callback
router.post('/stkpush/callback', async (req: Request, res: Response) => {
  console.log('>>> Incoming M-Pesa Callback:', JSON.stringify(req.body, null, 2));
  const callback = req.body?.Body?.stkCallback;

  if (!callback) {
    res.status(400).json({ message: 'Invalid callback payload' });
    return;
  }

  const {
    MerchantRequestID,
    CheckoutRequestID,
    ResultCode,
    ResultDesc,
    CallbackMetadata,
  } = callback as {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResultCode: number;
    ResultDesc: string;
    CallbackMetadata?: { Item: { Name: string; Value: any }[] };
  };

  const toStatus = (): string => {
    const desc = (ResultDesc || '').toLowerCase();
    if (ResultCode === 0) return 'success';
    if (ResultCode === 1032 || desc.includes('cancel')) return 'cancelled';
    if (ResultCode === 1037 || desc.includes('timeout')) return 'timeout';
    if (desc.includes('wrong pin') || desc.includes('pin')) return 'wrong_pin';
    if (desc.includes('insufficient') || desc.includes('less than')) return 'insufficient_funds';
    return 'failure';
  };

  const statusStr = toStatus();
  
  let amount = 0;
  let receipt = 'N/A';
  let phone = 'N/A';

  if (ResultCode === 0 && CallbackMetadata?.Item) {
    const metadata: Record<string, any> = {};
    CallbackMetadata.Item.forEach((item) => {
      metadata[item.Name] = item.Value;
    });
    amount = metadata.Amount || 0;
    receipt = metadata.MpesaReceiptNumber || 'N/A';
    phone = metadata.PhoneNumber || 'N/A';
  }

  try {
    // Save/upsert to DB regardless of success or failure
    const transaction = await prisma.mpesaPayment.upsert({
      where: { checkoutRequestId: CheckoutRequestID },
      update: {
        merchantRequestId: MerchantRequestID,
        resultCode: ResultCode,
        resultDesc: ResultDesc,
        amount: amount,
        mpesaReceiptNumber: receipt,
        phoneNumber: String(phone),
      },
      create: {
        merchantRequestId: MerchantRequestID,
        checkoutRequestId: CheckoutRequestID,
        resultCode: ResultCode,
        resultDesc: ResultDesc,
        amount: amount,
        mpesaReceiptNumber: receipt,
        phoneNumber: String(phone),
      }
    });

    console.log('Saved M-Pesa transaction to database:', transaction.id);

    const io = req.app.get('io');
    if (io && CheckoutRequestID) {
      console.log(`Emitting transaction_update for room ${CheckoutRequestID}`);
      io.to(CheckoutRequestID).emit('transaction_update', {
        checkoutRequestId: CheckoutRequestID,
        merchantRequestId: MerchantRequestID,
        resultCode: ResultCode,
        resultDesc: ResultDesc,
        status: statusStr,
        amount,
        receipt,
        phone,
      });
    }
  } catch (err: any) {
    console.error('Error saving transaction to DB:', err.message);
    console.error('Stack:', err.stack);
  }

  res.status(200).json({ message: 'Callback received successfully' });
});

// GET /api/stkpush/status/:checkoutRequestId
router.get('/stkpush/status/:checkoutRequestId', async (req: Request, res: Response) => {
  try {
    const checkoutRequestId = req.params.checkoutRequestId as string;
    const transaction = await prisma.mpesaPayment.findUnique({
      where: { checkoutRequestId }
    });
    
    if (transaction) {
      const desc = (transaction.resultDesc || '').toLowerCase();
      let status = 'failure';
      if (transaction.resultCode === 0) status = 'success';
      else if (transaction.resultCode === 1032 || desc.includes('cancel')) status = 'cancelled';
      else if (transaction.resultCode === 1037 || desc.includes('timeout')) status = 'timeout';
      else if (desc.includes('wrong pin') || desc.includes('pin')) status = 'wrong_pin';
      else if (desc.includes('insufficient') || desc.includes('less than')) status = 'insufficient_funds';

      res.json({
        status,
        resultCode: transaction.resultCode,
        resultDesc: transaction.resultDesc
      });
    } else {
      res.status(404).json({ status: 'pending' }); // Not yet received
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// GET /api/transactions
router.get('/transactions', async (_req: Request, res: Response) => {
  try {
    const transactions = await prisma.mpesaPayment.findMany({
      orderBy: { transactionDate: 'desc' },
      take: 50
    });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;

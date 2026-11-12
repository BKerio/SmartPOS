export type { OrderReceiptData, OrderReceiptLine } from "@/lib/orderReceiptTypes";
export { downloadOrderReceipt, printOrderReceipt } from "@/lib/orderReceiptPdf";

import type { OrderReceiptData } from "@/lib/orderReceiptTypes";

export function receiptFromPosTransaction(
  receipt: {
    id: string;
    receiptNo?: string | null;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
    paymentReference?: string | null;
    dailyNo?: number | null;
    cashierName?: string | null;
    servedBy?: string | null;
    items: { quantity: number; price: number; menuItem: { name: string } }[];
    student?: { name: string; regNo: string } | null;
  },
  fallbackStudent?: { name: string; regNo: string },
  servedByOverride?: string,
): OrderReceiptData {
  const receiptNo =
    receipt.receiptNo ||
    `ORDER-${receipt.id.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-6)}`;

  const student = receipt.student ?? fallbackStudent;
  const servedBy =
    servedByOverride?.trim() ||
    receipt.servedBy?.trim() ||
    receipt.cashierName?.trim() ||
    undefined;

  // Payment mode as the customer knows it. A cash sale with an M-Pesa code is a payment to our till.
  const ref = receipt.paymentReference?.trim() || null;
  const mode =
    receipt.paymentMethod === "mpesa"
      ? { paymentMode: "M-Pesa (STK prompt)", mpesaCode: ref, paidToTill: true }
      : receipt.paymentMethod === "cash"
        ? ref
          ? { paymentMode: "M-Pesa till", mpesaCode: ref, paidToTill: true }
          : { paymentMode: "Cash", mpesaCode: null, paidToTill: false }
        : { paymentMode: "Student wallet", mpesaCode: null, paidToTill: false };

  return {
    receiptNo,
    orderNo: receipt.dailyNo ?? null,
    ...mode,
    studentName: student?.name ?? "Guest",
    regNo: student?.regNo ?? "Walk-in",
    items: receipt.items.map((i) => ({
      name: i.menuItem.name,
      quantity: i.quantity,
      price: i.price,
    })),
    total: receipt.totalAmount,
    paidAt: receipt.createdAt,
    paymentMethod:
      receipt.paymentMethod === "mpesa"
        ? "M-Pesa"
        : receipt.paymentMethod === "cash"
          ? "Cash"
          : "Wallet",
    servedBy,
  };
}

export function receiptFromGuestCash(
  receipt: {
    id: string;
    receiptNo?: string | null;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
    paymentReference?: string | null;
    dailyNo?: number | null;
    cashierName?: string | null;
    servedBy?: string | null;
    items: { quantity: number; price: number; menuItem: { name: string } }[];
  },
  servedByOverride?: string,
): OrderReceiptData {
  const data = receiptFromPosTransaction(
    receipt,
    { name: "Guest", regNo: receipt.paymentReference ? "Walk-in · M-Pesa to till" : "Walk-in · Cash" },
    servedByOverride,
  );
  if (receipt.paymentReference) {
    data.paymentMethod = `${data.paymentMethod || "Cash"} · M-Pesa ${receipt.paymentReference}`;
  }
  return data;
}

export function receiptFromApiResponse(
  receipt: {
    id: string;
    receiptNo?: string | null;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
    paymentReference?: string | null;
    dailyNo?: number | null;
    cashierName?: string | null;
    servedBy?: string | null;
    items: { quantity: number; price: number; menuItem: { name: string } }[];
  },
  student: { name: string; regNo: string },
  servedByOverride?: string,
) {
  return receiptFromPosTransaction(receipt, student, servedByOverride);
}

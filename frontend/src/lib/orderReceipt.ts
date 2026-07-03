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
    items: { quantity: number; price: number; menuItem: { name: string } }[];
    student?: { name: string; regNo: string } | null;
  },
  fallbackStudent?: { name: string; regNo: string },
): OrderReceiptData {
  const receiptNo =
    receipt.receiptNo ||
    `ORDER-${receipt.id.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-6)}`;

  const student = receipt.student ?? fallbackStudent;

  return {
    receiptNo,
    studentName: student?.name ?? "Guest",
    regNo: student?.regNo ?? "Walk-in",
    items: receipt.items.map((i) => ({
      name: i.menuItem.name,
      quantity: i.quantity,
      price: i.price,
    })),
    total: receipt.totalAmount,
    paidAt: receipt.createdAt,
    paymentMethod: receipt.paymentMethod === "mpesa" ? "M-Pesa" : "Wallet",
  };
}

export function receiptFromApiResponse(
  receipt: {
    id: string;
    receiptNo?: string | null;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
    items: { quantity: number; price: number; menuItem: { name: string } }[];
  },
  student: { name: string; regNo: string },
) {
  return receiptFromPosTransaction(receipt, student);
}

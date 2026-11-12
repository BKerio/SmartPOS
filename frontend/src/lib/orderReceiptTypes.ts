export type OrderReceiptLine = {
  name: string;
  quantity: number;
  price: number;
};

export type OrderReceiptData = {
  receiptNo: string;
  studentName: string;
  regNo: string;
  items: OrderReceiptLine[];
  total: number;
  paidAt: string;
  paymentMethod?: string;
  /** Restaurant staff who processed the sale */
  servedBy?: string;
  /** Order number of the day (1, 2, 3...), printed as 0001 */
  orderNo?: number | null;
  /** How it was paid, for the "Payment" line: Student wallet, M-Pesa (STK prompt), M-Pesa till, Cash */
  paymentMode?: string;
  /** M-Pesa confirmation code, when paid by M-Pesa */
  mpesaCode?: string | null;
  /** True when the money went to our Lipa na M-Pesa till (show the till number on that line) */
  paidToTill?: boolean;
};

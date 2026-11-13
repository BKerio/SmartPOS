import { jsPDF } from "jspdf";
import {
  INK,
  M,
  MUTED,
  PAGE_W,
  TILL_NUMBER,
  dashed,
  defaultLogoUrl,
  formatDateTime,
  formatMoney,
  loadReceiptLogo,
  spaced,
  titleCase,
  type ReceiptLogo,
} from "@/lib/orderReceiptPdf";

/*
 * Sales invoice as a thermal-roll PDF, in the same style as the POS receipt (lib/orderReceiptPdf.ts):
 * logo, framed number, label/value rows, item lines, dashed dividers, till box. The page is exactly as
 * long as the content.
 */
export type InvoicePdfData = {
  invoiceNo: string;
  status: string; // unpaid | partial | paid | cancelled
  customerName: string;
  customerPhone?: string | null;
  waiterName: string;
  createdByName?: string;
  createdAt: string;
  dueDate?: string | null;
  notes?: string | null;
  overdue?: boolean;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  payments: { amount: number; method: string; reference?: string | null; createdAt: string }[];
};

const STATUS_TEXT: Record<string, string> = { unpaid: "UNPAID", partial: "PART PAID", paid: "PAID IN FULL", cancelled: "CANCELLED" };
const METHOD_TEXT: Record<string, string> = { mpesa: "M-Pesa", cash: "Cash", bank: "Bank", card: "Card" };
const fmtDay = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "-";

function drawInvoice(doc: jsPDF, inv: InvoicePdfData, logo: ReceiptLogo | null): number {
  const cx = PAGE_W / 2;
  const right = PAGE_W - M;
  let y = 5;

  // ── Brand ──
  if (logo) {
    const w = 58;
    const h = w * logo.aspect;
    doc.addImage(logo.dataUrl, "PNG", cx - w / 2, y, w, h, "logo", "NONE");
    y += h + 3.2;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("School cafeteria", cx, y, { align: "center" });
  y += 4.5;

  // ── Invoice number + status ──
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.45);
  doc.roundedRect(M, y, PAGE_W - 2 * M, 16, 1.6, 1.6, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  spaced(doc, "SALES INVOICE", cx, y + 4.2, "center", 0.8);
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  spaced(doc, inv.invoiceNo, cx, y + 11.6, "center", 0.4);
  y += 22.5;

  // status pill: filled for unpaid/overdue so it stands out on a thermal print
  const status = inv.overdue && inv.status !== "paid" && inv.status !== "cancelled" ? "OVERDUE" : STATUS_TEXT[inv.status] ?? inv.status.toUpperCase();
  const strong = status === "UNPAID" || status === "OVERDUE";
  doc.setFontSize(7.5);
  const pw = doc.getTextWidth(status) + 0.6 * (status.length - 1) + 8;
  doc.setLineWidth(0.35);
  if (strong) {
    doc.setFillColor(...INK);
    doc.roundedRect(cx - pw / 2, y - 3.6, pw, 5.4, 2.7, 2.7, "F");
    doc.setTextColor(255, 255, 255);
  } else {
    doc.roundedRect(cx - pw / 2, y - 3.6, pw, 5.4, 2.7, 2.7, "S");
    doc.setTextColor(...INK);
  }
  spaced(doc, status, cx, y + 0.3, "center", 0.6);
  y += 6;

  // ── Details ──
  const rows: [string, string][] = [
    ["Customer", titleCase(inv.customerName)],
    ...(inv.customerPhone ? ([["Phone", inv.customerPhone]] as [string, string][]) : []),
    ["Date", formatDateTime(inv.createdAt)],
    ["Pay by", fmtDay(inv.dueDate)],
    ["Served by", titleCase(inv.waiterName)],
    ...(inv.createdByName && inv.createdByName !== inv.waiterName ? ([["Raised by", titleCase(inv.createdByName)]] as [string, string][]) : []),
  ];
  doc.setFontSize(7.8);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    const lines = doc.splitTextToSize(value, 44) as string[];
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(label, M, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    lines.forEach((ln, i) => doc.text(ln, right, y + i * 3.4, { align: "right" }));
    y += 3.4 * lines.length + 1.1;
  }
  if (inv.notes?.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(inv.notes.trim(), PAGE_W - 2 * M) as string[];
    lines.slice(0, 4).forEach((ln, i) => doc.text(ln, M, y + 0.6 + i * 3.1));
    y += Math.min(lines.length, 4) * 3.1 + 1;
  }
  y += 1;
  dashed(doc, y);
  y += 4.2;

  // ── Items ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  spaced(doc, "ITEM", M, y, "left", 0.4);
  spaced(doc, "QTY", 50, y, "center", 0.4);
  spaced(doc, "AMOUNT", right, y, "right", 0.4);
  y += 4;
  for (const item of inv.items) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...INK);
    const name = doc.splitTextToSize(titleCase(item.description), 36) as string[];
    name.forEach((ln, i) => doc.text(ln, M, y + i * 3.6));
    doc.text(String(item.quantity), 50, y, { align: "center" });
    doc.text(formatMoney(item.total), right, y, { align: "right" });
    y += 3.6 * name.length;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text(`@ ${formatMoney(item.unitPrice)}`, M, y);
    y += 4.4;
  }
  y -= 0.6;
  dashed(doc, y);
  y += 5;

  // ── Totals ──
  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(...MUTED);
    doc.text(label, M, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(value, right, y, { align: "right" });
    y += 4.4;
  };
  line("Invoice total", formatMoney(inv.totalAmount));
  line("Paid so far", formatMoney(inv.paidAmount));
  y += 1.4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  spaced(doc, inv.status === "cancelled" ? "CANCELLED" : "BALANCE DUE", M, y, "left", 0.5);
  doc.setFontSize(14);
  doc.text(formatMoney(inv.status === "cancelled" ? 0 : inv.balance), right, y + 0.4, { align: "right" });
  y += 4.6;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(M, y, right, y);
  doc.setLineWidth(0.2);
  doc.line(M, y + 0.9, right, y + 0.9);
  y += 5.6;

  // ── Payments received ──
  if (inv.payments.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    spaced(doc, "PAYMENTS RECEIVED", M, y, "left", 0.4);
    y += 4;
    for (const p of inv.payments) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      doc.setTextColor(...INK);
      doc.text(`${METHOD_TEXT[p.method] ?? p.method}${p.reference ? ` · ${p.reference}` : ""}`, M, y);
      doc.text(formatMoney(p.amount), right, y, { align: "right" });
      y += 3.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.6);
      doc.setTextColor(...MUTED);
      doc.text(formatDateTime(p.createdAt), M, y);
      y += 4.2;
    }
    y -= 0.6;
    dashed(doc, y);
    y += 5;
  }

  // ── How to pay + footer ──
  const owing = inv.status !== "paid" && inv.status !== "cancelled" && inv.balance > 0;
  if (owing) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...INK);
    doc.text("How to pay", cx, y, { align: "center" });
    y += 3.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text("Pay by M-Pesa to the till below, quoting the invoice", cx, y, { align: "center" });
    y += 3.2;
    doc.text("number, or in cash at the restaurant counter.", cx, y, { align: "center" });
    y += 4.6;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...INK);
    doc.text(inv.status === "cancelled" ? "This invoice was cancelled." : "Thank you for your payment!", cx, y, { align: "center" });
    y += 4.6;
  }
  doc.setDrawColor(150, 156, 166);
  doc.setLineWidth(0.25);
  doc.roundedRect(M + 6, y - 3.4, PAGE_W - 2 * M - 12, 6.4, 1.2, 1.2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(...INK);
  doc.text(`Lipa na M-Pesa · Buy Goods Till ${TILL_NUMBER}`, cx, y + 0.9, { align: "center" });
  y += 6.4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.setTextColor(...MUTED);
  doc.text("Better Forks Restaurant Limited · SmartPOS", cx, y, { align: "center" });
  return y + 5;
}

export async function buildInvoicePdf(inv: InvoicePdfData, logoUrl: string = defaultLogoUrl): Promise<jsPDF> {
  const logo = await loadReceiptLogo(logoUrl);
  const scratch = new jsPDF({ unit: "mm", format: [PAGE_W, 800], orientation: "portrait" });
  const height = Math.max(100, Math.ceil(drawInvoice(scratch, inv, logo)));
  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, height], orientation: "portrait" });
  doc.setProperties({ title: `Invoice ${inv.invoiceNo}`, author: "Better Forks Restaurant Limited", creator: "SmartPOS" });
  drawInvoice(doc, inv, logo);
  return doc;
}

const fileName = (invoiceNo: string) => `invoice-${invoiceNo.replace(/[^a-z0-9-]/gi, "_")}.pdf`;

export async function downloadInvoicePdf(inv: InvoicePdfData) {
  (await buildInvoicePdf(inv)).save(fileName(inv.invoiceNo));
}

export async function printInvoicePdf(inv: InvoicePdfData) {
  const doc = await buildInvoicePdf(inv);
  doc.autoPrint();
  const win = window.open(doc.output("bloburl"), "_blank");
  if (!win) throw new Error("Pop-up blocked. Allow pop-ups to print the invoice.");
}

import { jsPDF } from "jspdf";
import { brandEmblemPng } from "@/lib/brandEmblem";
import type { OrderReceiptData } from "@/lib/orderReceiptTypes";

const formatMoney = (amount: number) => `KES ${amount.toLocaleString()}`;

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

async function loadImageDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function safeFilename(receiptNo: string) {
  return `receipt-${receiptNo.replace(/[^a-z0-9-]/gi, "_")}.pdf`;
}

const PAGE_W = 80; // mm, standard thermal roll
const M = 5; // side margin
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [100, 108, 120];

const titleCase = (s: string) =>
  s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase()) : s;

/** Letter-spaced text. jsPDF ignores charSpace when centring/right-aligning, so place it by hand. */
function spaced(doc: jsPDF, text: string, x: number, y: number, align: "left" | "center" | "right", charSpace: number) {
  const width = doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  doc.text(text, left, y, { charSpace });
}

function dashed(doc: jsPDF, y: number) {
  doc.setDrawColor(150, 156, 166);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([0.9, 0.9], 0);
  doc.line(M, y, PAGE_W - M, y);
  doc.setLineDashPattern([], 0);
}

/**
 * Draws the receipt top to bottom and returns where it ended, so the caller can size the page to fit
 * (thermal rolls are cut after the last line; a fixed tall page left a long blank tail).
 */
function drawReceipt(doc: jsPDF, data: OrderReceiptData, emblem: string | null, logoFallback: string | null): number {
  const cx = PAGE_W / 2;
  const right = PAGE_W - M;
  let y = 5;

  // ── Brand ──
  if (emblem) {
    const w = 44;
    const h = (w * 128) / 216;
    doc.addImage(emblem, "PNG", cx - w / 2, y, w, h, "emblem", "FAST");
    y += h + 2.5;
  } else if (logoFallback) {
    doc.addImage(logoFallback, "PNG", cx - 15, y, 30, 30);
    y += 32;
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  spaced(doc, "RESTAURANT LIMITED", cx, y, "center", 1.1);
  y += 3.6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("School cafeteria", cx, y, { align: "center" });
  y += 4.5;

  // ── Receipt number ──
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.45);
  doc.roundedRect(M, y, PAGE_W - 2 * M, 12, 1.6, 1.6, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  spaced(doc, "SALES RECEIPT", cx, y + 4, "center", 0.8);
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  spaced(doc, data.receiptNo, cx, y + 9.4, "center", 0.3);
  y += 17;

  // ── Details ──
  const isGuest = !data.regNo || /walk-in/i.test(data.regNo) || data.studentName === "Guest";
  const rows: [string, string][] = [
    ["Date", formatDateTime(data.paidAt)],
    ["Customer", isGuest ? "Walk-in guest" : titleCase(data.studentName)],
    ...(!isGuest ? ([["Adm no.", data.regNo]] as [string, string][]) : []),
    ...(data.servedBy ? ([["Served by", titleCase(data.servedBy)]] as [string, string][]) : []),
    ["Payment", data.paymentMethod || "Wallet"],
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
  let count = 0;
  for (const item of data.items) {
    count += item.quantity;
    // Set the font first: splitTextToSize measures with the current font, and names must clear the Qty column.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    const name = doc.splitTextToSize(titleCase(item.name), 36) as string[];
    doc.setTextColor(...INK);
    name.forEach((ln, i) => doc.text(ln, M, y + i * 3.6));
    doc.text(String(item.quantity), 50, y, { align: "center" });
    doc.text(formatMoney(item.price * item.quantity), right, y, { align: "right" });
    y += 3.6 * name.length;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text(`@ ${formatMoney(item.price)}`, M, y);
    y += 4.4;
  }
  y -= 0.6;
  dashed(doc, y);
  y += 5;

  // ── Total ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`${count} item${count === 1 ? "" : "s"}`, M, y);
  y += 5.6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  spaced(doc, "TOTAL PAID", M, y, "left", 0.5);
  doc.setFontSize(14);
  doc.text(formatMoney(data.total), right, y + 0.4, { align: "right" });
  y += 4.6;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(M, y, right, y);
  doc.setLineWidth(0.2);
  doc.line(M, y + 0.9, right, y + 0.9);
  y += 6.2;

  // ── Footer ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...INK);
  doc.text("Thank you, enjoy your meal!", cx, y, { align: "center" });
  y += 3.8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.setTextColor(...MUTED);
  doc.text("Keep this receipt for your records.", cx, y, { align: "center" });
  y += 3.2;
  doc.text("Better Forks Restaurant Limited · SmartPOS", cx, y, { align: "center" });
  return y + 5;
}

export async function buildReceiptPdf(data: OrderReceiptData, logoUrl?: string): Promise<jsPDF> {
  const emblem = await brandEmblemPng();
  const fallback = !emblem && logoUrl ? await loadImageDataUrl(logoUrl) : null;
  // Measure on a tall scratch page, then draw again on a page exactly as long as the content.
  const scratch = new jsPDF({ unit: "mm", format: [PAGE_W, 600], orientation: "portrait" });
  const height = Math.max(90, Math.ceil(drawReceipt(scratch, data, emblem, fallback)));
  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, height], orientation: "portrait" });
  doc.setProperties({ title: `Receipt ${data.receiptNo}`, author: "Better Forks Restaurant Limited", creator: "SmartPOS" });
  drawReceipt(doc, data, emblem, fallback);
  return doc;
}

export async function downloadOrderReceipt(data: OrderReceiptData, logoUrl?: string) {
  const doc = await buildReceiptPdf(data, logoUrl);
  doc.save(safeFilename(data.receiptNo));
}

export async function printOrderReceipt(data: OrderReceiptData, logoUrl?: string) {
  const doc = await buildReceiptPdf(data, logoUrl);
  doc.autoPrint();
  const blob = doc.output("bloburl");
  const win = window.open(blob, "_blank");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to print your receipt.");
  }
}

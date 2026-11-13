import { jsPDF } from "jspdf";
import defaultLogoUrl from "@/assets/LOGO.png";
export { defaultLogoUrl };
import type { OrderReceiptData } from "@/lib/orderReceiptTypes";

export const formatMoney = (amount: number) => `KES ${amount.toLocaleString()}`;

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export async function loadImageDataUrl(src: string): Promise<string | null> {
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

export type ReceiptLogo = { dataUrl: string; aspect: number };
const logoCache = new Map<string, Promise<ReceiptLogo | null>>();

/**
 * LOGO.png is a 1024x1024 square with the artwork in a band across the middle. Trim the white margins
 * so the logo itself can fill the receipt width, and keep every source pixel (lossless PNG).
 */
export function loadReceiptLogo(src: string): Promise<ReceiptLogo | null> {
  if (!logoCache.has(src)) {
    logoCache.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return resolve(null);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0);
            const px = ctx.getImageData(0, 0, w, h).data;
            let minX = w, minY = h, maxX = -1, maxY = -1;
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                if (px[i] < 238 || px[i + 1] < 238 || px[i + 2] < 238) {
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                }
              }
            }
            if (maxX < 0) return resolve(null);
            const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
            const sx = Math.max(0, minX - pad);
            const sy = Math.max(0, minY - pad);
            const sw = Math.min(w, maxX + pad + 1) - sx;
            const sh = Math.min(h, maxY + pad + 1) - sy;
            const out = document.createElement("canvas");
            out.width = sw;
            out.height = sh;
            const octx = out.getContext("2d");
            if (!octx) return resolve(null);
            octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
            resolve({ dataUrl: out.toDataURL("image/png"), aspect: sh / sw });
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      }),
    );
  }
  return logoCache.get(src)!;
}

function safeFilename(receiptNo: string) {
  return `receipt-${receiptNo.replace(/[^a-z0-9-]/gi, "_")}.pdf`;
}

export const PAGE_W = 80; // mm, standard thermal roll
/** Our Lipa na M-Pesa (Buy Goods) till, printed on every receipt. Override with VITE_TILL_NUMBER. */
export const TILL_NUMBER = String(import.meta.env.VITE_TILL_NUMBER || "3611959");
export const M = 5; // side margin
export const INK: [number, number, number] = [17, 24, 39];
export const MUTED: [number, number, number] = [100, 108, 120];

export const titleCase = (s: string) =>
  s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s'(/-])\p{L}/gu, (c) => c.toUpperCase()) : s;

/** Letter-spaced text. jsPDF ignores charSpace when centring/right-aligning, so place it by hand. */
export function spaced(doc: jsPDF, text: string, x: number, y: number, align: "left" | "center" | "right", charSpace: number) {
  const width = doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  doc.text(text, left, y, { charSpace });
}

export function dashed(doc: jsPDF, y: number) {
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
function drawReceipt(doc: jsPDF, data: OrderReceiptData, logo: ReceiptLogo | null, logoFallback: string | null): number {
  const cx = PAGE_W / 2;
  const right = PAGE_W - M;
  let y = 5;

  // ── Brand: the logo (it carries "Better Fork · Restaurant Limited") across most of the roll ──
  if (logo) {
    const w = 58;
    const h = w * logo.aspect;
    // alias "logo" + no recompression: embedded once per PDF, every source pixel kept
    doc.addImage(logo.dataUrl, "PNG", cx - w / 2, y, w, h, "logo", "NONE");
    y += h + 3.2;
  } else if (logoFallback) {
    doc.addImage(logoFallback, "PNG", cx - 20, y - 6, 40, 40, "logo", "NONE");
    y += 31;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("School cafeteria", cx, y, { align: "center" });
  y += 4.5;

  // ── Order number of the day (0001, 0002...) ──
  const hasNo = data.orderNo != null && data.orderNo > 0;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.45);
  doc.roundedRect(M, y, PAGE_W - 2 * M, hasNo ? 16 : 12, 1.6, 1.6, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  spaced(doc, hasNo ? "ORDER NO." : "SALES RECEIPT", cx, y + 4.2, "center", 0.8);
  doc.setTextColor(...INK);
  if (hasNo) {
    doc.setFontSize(22);
    spaced(doc, String(data.orderNo).padStart(4, "0"), cx, y + 12.6, "center", 1.2);
    y += 21;
  } else {
    doc.setFontSize(11.5);
    spaced(doc, data.receiptNo, cx, y + 9.4, "center", 0.3);
    y += 17;
  }

  // ── Details (no customer name; admission no. only for wallet sales, so a payment can be traced) ──
  const isGuest = !data.regNo || /walk-in/i.test(data.regNo) || data.studentName === "Guest";
  const mode = data.paymentMode || data.paymentMethod || "Wallet";
  const rows: [string, string][] = [
    ...(hasNo ? ([["Receipt ref.", data.receiptNo]] as [string, string][]) : []),
    ["Date", formatDateTime(data.paidAt)],
    ...(!isGuest ? ([["Adm no.", data.regNo]] as [string, string][]) : []),
    ...(data.servedBy ? ([["Served by", titleCase(data.servedBy)]] as [string, string][]) : []),
    ["Payment", mode],
    ...(data.mpesaCode ? ([["M-Pesa code", data.mpesaCode]] as [string, string][]) : []),
    ...(data.paidToTill ? ([["Till no.", TILL_NUMBER]] as [string, string][]) : []),
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
  y += 4.6;
  // Till box: how to pay us by M-Pesa next time
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

export async function buildReceiptPdf(data: OrderReceiptData, logoUrl: string = defaultLogoUrl): Promise<jsPDF> {
  const logo = await loadReceiptLogo(logoUrl);
  const fallback = !logo ? await loadImageDataUrl(logoUrl) : null;
  // Measure on a tall scratch page, then draw again on a page exactly as long as the content.
  const scratch = new jsPDF({ unit: "mm", format: [PAGE_W, 600], orientation: "portrait" });
  const height = Math.max(90, Math.ceil(drawReceipt(scratch, data, logo, fallback)));
  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, height], orientation: "portrait" });
  doc.setProperties({ title: `Receipt ${data.receiptNo}`, author: "Better Forks Restaurant Limited", creator: "SmartPOS" });
  drawReceipt(doc, data, logo, fallback);
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

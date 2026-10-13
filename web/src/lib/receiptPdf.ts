import type { jsPDF } from "jspdf";
import { QR_CAPTION, qrRuns, qrSide, type QrMatrix } from "./qr";
import {
  receiptFileBase,
  receiptPdfLines,
  receiptRefLine,
  type ReceiptExport,
} from "./receiptExport";

/**
 * The receipt slip, drawn as an A4 PDF.
 *
 * jsPDF is pinned and imported dynamically inside `downloadReceiptPdf`, so it is a chunk of its
 * own that is only fetched when someone presses the button: the receipt page itself still loads
 * without it. Nothing is sent anywhere — the file is built in the tab and handed to the browser.
 *
 * Colour comes from the page's own tokens (see `readPdfPalette`), so the printed slip is the same
 * paper and ink as the screen. The QR code is drawn as vector rectangles from the same matrix the
 * page renders, so it stays sharp at any zoom and needs no canvas.
 */

/** mm. A4 is 210 x 297. */
const PAGE = { width: 210, margin: 18 } as const;
const SLIP = { x: PAGE.margin, width: 210 - PAGE.margin * 2 } as const;
const LABEL_WIDTH = 30;
const PAD = 10;
/** Height of one tooth on the torn bottom edge. */
const TOOTH = 4;
const QR_SIZE = 34;

/** The ink the slip is drawn with. Hex, because that is what jsPDF takes. */
export type PdfPalette = { paper: string; ink: string; inkSoft: string; accentInk: string };

/** The tokens' own values, used when the page can't be read (no DOM, or a non-hex token). */
export const PDF_PALETTE_FALLBACK: PdfPalette = {
  paper: "#f7ddb8",
  ink: "#1c0f06",
  inkSoft: "#6b4a2e",
  accentInk: "#8f3400",
};

const TOKENS: Record<keyof PdfPalette, string> = {
  paper: "--paper",
  ink: "--ink",
  inkSoft: "--ink-soft",
  accentInk: "--accent-ink",
};

/**
 * Resolve the four tokens the slip needs through `read`, falling back token by token.
 *
 * Kept separate from the DOM so it can be exercised directly: a token that is missing, empty or
 * not a plain hex colour (`rgb(...)`, `color-mix(...)`, a `var()` that never resolved) must not
 * reach jsPDF, which would silently draw it black.
 */
export function pdfPalette(read: (token: string) => string | undefined): PdfPalette {
  const resolved = { ...PDF_PALETTE_FALLBACK };
  for (const key of Object.keys(TOKENS) as (keyof PdfPalette)[]) {
    const hex = normalizeHex(read(TOKENS[key]));
    if (hex) resolved[key] = hex;
  }
  return resolved;
}

/** "#ABC" -> "#aabbcc", "#1c0f06" -> "#1c0f06", anything else -> undefined. */
export function normalizeHex(value: string | undefined): string | undefined {
  const text = value?.trim().toLowerCase();
  if (!text) return undefined;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((c) => c + c).join("")}`;
  return undefined;
}

/** Reads the live tokens off `:root`, so the PDF follows the theme the reader is looking at. */
export function readPdfPalette(): PdfPalette {
  if (typeof window === "undefined") return PDF_PALETTE_FALLBACK;
  const style = window.getComputedStyle(document.documentElement);
  return pdfPalette((token) => style.getPropertyValue(token));
}

export type ReceiptPdfOptions = {
  receipt: ReceiptExport;
  /** The encoded receipt URL, from `QRCode.create`. */
  qr: QrMatrix;
  palette?: PdfPalette;
};

/** Loads jsPDF and draws the slip. Separate from saving, so the drawing can be exercised. */
export async function buildReceiptPdf({ receipt, qr, palette }: ReceiptPdfOptions): Promise<jsPDF> {
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "mm", format: "a4", compress: true });
  drawReceipt(doc, receipt, qr, palette ?? readPdfPalette());
  return doc;
}

/** Builds the PDF and asks the browser to save it. Returns the filename it used. */
export async function downloadReceiptPdf(options: ReceiptPdfOptions): Promise<string> {
  const doc = await buildReceiptPdf(options);
  const filename = `${receiptFileBase(options.receipt)}.pdf`;
  doc.save(filename);
  return filename;
}

function drawReceipt(doc: jsPDF, receipt: ReceiptExport, qr: QrMatrix, c: PdfPalette): void {
  doc.setProperties({
    title: `SettleOnce receipt ${receipt.invoiceRef ?? receipt.invoiceKey}`,
    subject: `Settlement at block ${receipt.paidAtBlock} on ${receipt.chainName}`,
    creator: "SettleOnce",
  });

  const left = SLIP.x + PAD;
  const right = SLIP.x + SLIP.width - PAD;
  const inner = SLIP.width - PAD * 2;
  const top = PAGE.margin;
  let y = top + PAD + 6;

  // ---- header
  doc.setFont("helvetica", "bold").setFontSize(21).setTextColor(c.ink);
  doc.text("Settlement receipt", left, y);
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(receipt.chainName, right, y, { align: "right" });
  y += 5;
  dashed(doc, c.ink, 0.7, [2.2, 1.4], () => doc.line(left, y, right, y));
  y += 8;

  // ---- the two business references, when the link's pair really did derive the key
  const refs = receiptRefLine(receipt);
  if (refs) {
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(c.ink);
    // References can be 64 characters each, so this line is wrapped like any other.
    const wrapped = doc.splitTextToSize(refs, inner) as string[];
    doc.text(wrapped, left, y);
    y += 4 + (wrapped.length - 1) * 5.6;
    doc.setFont("helvetica", "normal").setFontSize(7.6).setTextColor(c.accentInk);
    doc.text("references match this key", left, y);
    y += 7;
  }

  // ---- every line the slip shows
  for (const line of receiptPdfLines(receipt)) {
    const amount = line.label === "Amount";
    doc.setFont("helvetica", "normal").setFontSize(7.8).setTextColor(c.inkSoft);
    doc.text(line.label, left, y);

    doc.setTextColor(c.ink);
    if (amount) doc.setFont("helvetica", "bold").setFontSize(13);
    else doc.setFont("courier", "normal").setFontSize(8.4);

    const valueX = left + LABEL_WIDTH;
    const wrapped = doc.splitTextToSize(line.value, inner - LABEL_WIDTH) as string[];
    doc.text(wrapped, valueX, y);

    const lineHeight = amount ? 5.4 : 3.6;
    y += Math.max(wrapped.length * lineHeight, 4.6) + 1.6;
    dotted(doc, c.inkSoft, () => doc.line(left, y, right, y));
    y += 5;
  }

  // ---- QR code on the left, "PAID ONCE" stamped on the right
  y += 2;
  const qrTop = y;
  drawQr(doc, qr, left, qrTop, QR_SIZE, c);

  let footY = qrTop + QR_SIZE + 4;
  doc.setFont("helvetica", "normal").setFontSize(7.6).setTextColor(c.inkSoft);
  doc.text(QR_CAPTION, left, footY);
  footY += 4;
  doc.setFont("courier", "normal").setFontSize(6.4);
  // The link in full as well as in the code, so it can be read off a print.
  const urlLines = doc.splitTextToSize(receipt.receiptUrl, QR_SIZE + 24) as string[];
  doc.text(urlLines, left, footY);
  footY += urlLines.length * 2.4;

  drawStamp(doc, receipt, right - 24, qrTop + QR_SIZE / 2 - 2, c);

  // ---- fine print, then the slip's own outline and torn bottom edge
  const fineY = Math.max(footY + 8, qrTop + QR_SIZE + 16);
  doc.setFont("helvetica", "normal").setFontSize(7.4).setTextColor(c.inkSoft);
  const fine = doc.splitTextToSize(
    `Read from the SettleOnce contract on ${receipt.chainName} and written out at ${receipt.generatedAt}. ` +
      "A second payment for this payer and invoice key is rejected by the contract.",
    inner,
  ) as string[];
  doc.text(fine, left, fineY);

  const bottom = fineY + fine.length * 3.4 + PAD;
  drawSlipEdge(doc, top, bottom, c);
}

/** The paper itself: a thick ink outline on three sides, torn into teeth along the bottom. */
function drawSlipEdge(doc: jsPDF, top: number, bottom: number, c: PdfPalette): void {
  const { x, width } = SLIP;
  doc.setLineWidth(0.9).setDrawColor(c.ink);
  doc.line(x, top, x + width, top);
  doc.line(x, top, x, bottom);
  doc.line(x + width, top, x + width, bottom);

  doc.setLineWidth(0.7);
  const teeth = Math.round(width / (TOOTH * 2));
  const step = width / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const sx = x + i * step;
    doc.line(sx, bottom, sx + step / 2, bottom + TOOTH);
    doc.line(sx + step / 2, bottom + TOOTH, sx + step, bottom);
  }
}

/** Dark modules as filled rectangles, scaled from module units to mm. */
function drawQr(doc: jsPDF, qr: QrMatrix, x: number, y: number, size: number, c: PdfPalette): void {
  const unit = size / qrSide(qr);
  doc.setFillColor(c.paper);
  doc.rect(x, y, size, size, "F");
  doc.setFillColor(c.ink);
  for (const run of qrRuns(qr)) {
    doc.rect(x + run.x * unit, y + run.y * unit, run.width * unit, unit, "F");
  }
}

/** The rubber stamp: double border, tilted the same few degrees as the one on screen. */
function drawStamp(doc: jsPDF, receipt: ReceiptExport, cx: number, cy: number, c: PdfPalette): void {
  const angle = 7; // jsPDF turns counter-clockwise, matching the slip's rotate(-7deg)
  const w = 44;
  const h = 17;
  doc.setDrawColor(c.accentInk).setLineWidth(0.8);
  rotatedRect(doc, cx, cy, w, h, angle);
  rotatedRect(doc, cx, cy, w - 2.4, h - 2.4, angle);

  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(c.accentInk);
  doc.text("PAID ONCE", cx, cy + 0.6, { align: "center", angle, baseline: "alphabetic" });
  doc.setFont("courier", "normal").setFontSize(6.6);
  doc.text(`BLOCK ${receipt.paidAtBlock}`, cx, cy + 5.4, { align: "center", angle, baseline: "alphabetic" });
}

function rotatedRect(doc: jsPDF, cx: number, cy: number, w: number, h: number, deg: number): void {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Positive `deg` lifts the right-hand side, the same direction jsPDF rotates text.
  const corner = (dx: number, dy: number): [number, number] => [cx + dx * cos + dy * sin, cy - dx * sin + dy * cos];
  const points = [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)];
  points.forEach(([px, py], i) => {
    const [qx, qy] = points[(i + 1) % points.length]!;
    doc.line(px, py, qx, qy);
  });
}

function dashed(doc: jsPDF, color: string, width: number, pattern: number[], draw: () => void): void {
  doc.setDrawColor(color).setLineWidth(width).setLineDashPattern(pattern, 0);
  draw();
  doc.setLineDashPattern([], 0);
}

function dotted(doc: jsPDF, color: string, draw: () => void): void {
  dashed(doc, color, 0.25, [0.5, 1.1], draw);
}

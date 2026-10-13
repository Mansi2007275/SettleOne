import { getAddress, isAddress } from "viem";
import { MAX_REF_LENGTH, normalizeRef } from "./invoice";
import { formatUsdcPlain, parseUsdc } from "./usdc";

/**
 * Read invoice fields out of OCR text.
 *
 * This is a *suggestion* engine for the composer form, nothing more. It never derives an invoice
 * key, never adds an invoice and never pays: the user reviews every field and presses "Add to
 * desk" themselves. Because OCR misreads characters, the one rule here is **never guess**: a field
 * we cannot read with evidence stays `undefined`, and anything we are not sure about is reported
 * with a confidence below "high" so the UI can ask the user to check it.
 */

export type ScanFieldName = "vendorRef" | "invoiceRef" | "recipient" | "amount";

/** high = read from an explicit label and verified; medium = read by position; low = check it. */
export type ScanConfidence = "high" | "medium" | "low";

export type ScanResult = {
  vendorRef?: string;
  invoiceRef?: string;
  recipient?: string;
  amount?: string;
  confidence: Partial<Record<ScanFieldName, ScanConfidence>>;
  rawText: string;
};

export const SCAN_FIELDS: readonly ScanFieldName[] = ["vendorRef", "invoiceRef", "recipient", "amount"] as const;

/**
 * One scan handed to the composer. `at` makes every scan a new object, so re-scanning the same
 * invoice re-fills the form instead of looking like nothing happened.
 */
export type ScanPrefill = { result: ScanResult; at: number };

/** What the composer shows next to a field: a confidence, or "missing" when OCR found nothing. */
export type ScanMark = ScanConfidence | "missing";

export function scanMarks(result: ScanResult): Record<ScanFieldName, ScanMark> {
  const marks = {} as Record<ScanFieldName, ScanMark>;
  for (const field of SCAN_FIELDS) {
    marks[field] = result[field] === undefined ? "missing" : (result.confidence[field] ?? "low");
  }
  return marks;
}

/* ------------------------------------------------------------------ helpers */

function lineList(text: string): string[] {
  return text
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim());
}

const DATE_LIKE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;

/**
 * "1,250.00" -> "1250.00", "1.250,00" -> "1250.00", "0,10" -> "0.10".
 * When both separators appear the *last* one is the decimal point. A lone separator is read as a
 * thousands group when it looks like one (1,250 / 1.250) and as a decimal point otherwise.
 */
export function normalizeScannedAmount(raw: string): string | undefined {
  let s = raw.replace(/[\s'’]/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return undefined;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }

  const parts = s.split(".");
  if (parts.length > 2) return undefined;
  let whole = (parts[0] ?? "").replace(/^0+(?=\d)/, "");
  let frac = parts[1] ?? "";
  if (whole === "") whole = "0";
  // USDC has 6 decimals. Trailing zeros past that are OCR noise; real digits past it are not ours to round.
  if (frac.length > 6) {
    frac = frac.replace(/0+$/, "");
    if (frac.length > 6) return undefined;
  }

  const candidate = frac ? `${whole}.${frac}` : whole;
  const parsed = parseUsdc(candidate);
  return parsed.ok ? formatUsdcPlain(parsed.units) : undefined;
}

/* ------------------------------------------------------------------ invoice number */

// "Invoice No: INV-1042", "Invoice #1042", "Inv: 88-A", "Bill No 5512", "बिल संख्या / Bill No: INV-77"
const INVOICE_LABEL =
  /\b(?:tax\s+)?(?:invoice|inv|bill)\s*(?:no\.?|nos\.?|number|num|#|id|ref(?:erence)?|serial)?\s*[:#.\-–—]?\s*([A-Za-z0-9][A-Za-z0-9/._-]{0,31})/i;
const INVOICE_LABEL_EXPLICIT = /(?:no\.?|number|num|#|id|ref(?:erence)?|serial)\s*[:#.\-–—]?\s*$/i;
const INVOICE_STANDALONE = /\b(?:INV|INVOICE|BILL)[-_/]?\s?(\d{2,10}[A-Za-z]?)\b/i;

function cleanRefToken(token: string): string | undefined {
  const t = token.replace(/[.\-_/]+$/, "").trim();
  if (!t || !/\d/.test(t) || DATE_LIKE.test(t)) return undefined;
  const ref = normalizeRef(t);
  return ref.length > 0 && ref.length <= MAX_REF_LENGTH ? ref : undefined;
}

function readInvoiceRef(lines: string[]): { value: string; confidence: ScanConfidence } | undefined {
  for (const line of lines) {
    const m = INVOICE_LABEL.exec(line);
    if (!m) continue;
    const value = cleanRefToken(m[1]!);
    if (!value) continue;
    const label = line.slice(m.index, m.index + m[0].length - m[1]!.length);
    const explicit = INVOICE_LABEL_EXPLICIT.test(label) || /[:#]\s*$/.test(label);
    return { value, confidence: explicit ? "high" : "medium" };
  }
  for (const line of lines) {
    const m = INVOICE_STANDALONE.exec(line);
    if (!m) continue;
    const value = cleanRefToken(m[0]!);
    if (value) return { value, confidence: "medium" };
  }
  return undefined;
}

/* ------------------------------------------------------------------ vendor */

const VENDOR_INLINE =
  /(?:bill(?:ed)?\s*from|issued\s*by|from|vendor|supplier|seller)\s*[:\-–—]\s*(.+)$/i;
const VENDOR_ALONE = /^(?:bill(?:ed)?\s*from|issued\s*by|from|vendor|supplier|seller)\s*[:\-–—]?\s*$/i;
const DOC_TITLE = /^(?:tax\s+|gst\s+|proforma\s+|commercial\s+)?(?:invoice|bill|receipt|statement)(?:\s*\/\s*\w+)?$/i;
const NOT_A_NAME =
  /^(?:bill\s*to|billed\s*to|ship\s*to|to|invoice|date|due|amount|total|subtotal|gstin|gst|pan|tel|phone|mobile|email|web|www|ref|terms|notes?|description|qty|rate|pay\s*to)\b/i;

/**
 * The document word printed after the company name on a letterhead:
 * "PixelForge Studio    INVOICE", "Acme Ltd — Tax Invoice", "Sharma Traders (CASH MEMO)",
 * "Orbit Tools Invoice INV-1042". None of it is part of the vendor's name, and the vendor
 * reference derives the invoice key, so "PIXELFORGE STUDIO INVOICE" and "PIXELFORGE STUDIO"
 * would be two different invoices for the same bill.
 *
 * Only a *trailing* word is stripped: a vendor genuinely called "Bill Hicks Design" keeps its
 * name, and a line that is nothing but the document word strips down to nothing and is refused.
 */
const VENDOR_DOC_TAIL =
  /[\s:|,;.\-\u2013\u2014()[\]#*]*\b(?:(?:tax|gst|proforma|commercial)\s+)?(?:invoice|bill|receipt|cash\s*memo|original|duplicate)s?\b(?:\s*(?:no\.?|number|#)?\s*[:#\-]?\s*[A-Za-z0-9][A-Za-z0-9/._-]*\d[A-Za-z0-9/._-]*)?[\s:|,;.\-\u2013\u2014()[\]#*]*$/i;

export function stripVendorDocWords(value: string): string {
  let out = value;
  // "Acme Ltd Tax Invoice Original" carries two of them, so strip until nothing changes.
  for (let i = 0; i < 4; i++) {
    const next = out.replace(VENDOR_DOC_TAIL, "");
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

function cleanVendor(value: string): string | undefined {
  const trimmed = stripVendorDocWords(value.replace(/^[\s:|\-–—]+/, "").replace(/[\s:|,;]+$/, ""));
  if (!trimmed) return undefined;
  if (/0[xX][0-9a-zA-Z]{30,}/.test(trimmed)) return undefined;
  if (/@|https?:\/\/|^www\./i.test(trimmed)) return undefined;
  if (DATE_LIKE.test(trimmed) || !/[A-Za-zऀ-ॿ].*[A-Za-zऀ-ॿ]/.test(trimmed)) return undefined;
  const ref = normalizeRef(trimmed);
  if (ref.length < 2) return undefined;
  return ref.slice(0, MAX_REF_LENGTH);
}

function readVendorRef(lines: string[]): { value: string; confidence: ScanConfidence } | undefined {
  const head = lines.slice(0, 14);

  for (let i = 0; i < head.length; i++) {
    const line = head[i]!;
    if (!line) continue;
    const inline = VENDOR_INLINE.exec(line);
    if (inline) {
      const value = cleanVendor(inline[1]!);
      if (value) return { value, confidence: "high" };
    }
    if (VENDOR_ALONE.test(line)) {
      const next = head.slice(i + 1).find((l) => l.length > 0);
      const value = next ? cleanVendor(next) : undefined;
      if (value) return { value, confidence: "high" };
    }
  }

  // Fallback: the letterhead. The company that issued an invoice is normally the first real line.
  for (const line of lines.slice(0, 6)) {
    if (!line || DOC_TITLE.test(line) || NOT_A_NAME.test(line)) continue;
    const value = cleanVendor(line);
    if (value) return { value, confidence: "medium" };
  }
  return undefined;
}

/* ------------------------------------------------------------------ amount */

const AMOUNT_STRONG =
  /\b(?:grand\s*total|balance\s*due|amount\s*due|total\s*due|amount\s*payable|total\s*payable|net\s*payable|final\s*amount)\b/i;
const AMOUNT_PLAIN = /(?:\btotal\b|कुल)/i;
const AMOUNT_NOT_A_PRICE =
  /\b(?:sub\s*-?\s*total|subtotal|tax|gst|igst|cgst|sgst|vat|discount|shipping|freight|advance|round\s*off|total\s*(?:items?|qty|quantity|units?|hours?|days?|lines?|pages?))\b/i;
// Thousands and decimal separators only: a space would let "1,250.00 5 Oct" swallow the date.
const MONEY = /(?:(USDC|USD|\$|₹|INR|RS\.?)\s*)?(\d[\d.,]*\d|\d)\s*(USDC|USD)?/i;

function moneyIn(text: string): string | undefined {
  const m = MONEY.exec(text);
  if (!m) return undefined;
  const after = text.slice(m.index + m[0].length);
  if (/^\s*[%x×]/i.test(after)) return undefined;
  return normalizeScannedAmount(m[2]!);
}

function readAmount(lines: string[]): { value: string; confidence: ScanConfidence } | undefined {
  const found: { rank: number; value: string }[] = [];

  for (const line of lines) {
    if (!line || AMOUNT_NOT_A_PRICE.test(line)) continue;
    const strong = AMOUNT_STRONG.exec(line);
    const plain = strong ? null : AMOUNT_PLAIN.exec(line);
    const match = strong ?? plain;
    if (!match) continue;
    const value = moneyIn(line.slice(match.index + match[0].length));
    if (value) found.push({ rank: strong ? 3 : 2, value });
  }
  if (found.length === 0) return undefined;

  const topRank = Math.max(...found.map((f) => f.rank));
  const top = found.filter((f) => f.rank === topRank);
  const distinct = new Set(top.map((f) => f.value));
  // Totals live at the bottom of an invoice, so a later line wins; disagreement is never resolved silently.
  const value = top[top.length - 1]!.value;
  return { value, confidence: distinct.size > 1 ? "low" : "high" };
}

/* ------------------------------------------------------------------ recipient */

const HEX_TOKEN = /0[xX][0-9a-zA-Z]+/g;
const WALLET_LABEL =
  /\b(?:pay\s*to|payable\s*to|wallet|usdc\s*(?:wallet|address|account)|send\s*to|receiv(?:er|ing)|beneficiary|arc\s*address|deposit\s*to)\b/i;

/** OCR reads 0 as O and 1 as l or I. Repair those three characters, and only inside the 0x token. */
function repairHex(body: string): { fixed: string; changed: boolean } {
  const fixed = body.replace(/[oO]/g, "0").replace(/[lLiI]/g, "1");
  return { fixed, changed: fixed !== body };
}

type AddressCandidate = { value: string; confidence: ScanConfidence; labelled: boolean };

function readRecipient(lines: string[]): AddressCandidate | undefined {
  const candidates: AddressCandidate[] = [];

  lines.forEach((line, i) => {
    if (!line) return;
    const prev = lines[i - 1] ?? "";
    const labelled = WALLET_LABEL.test(line) || (WALLET_LABEL.test(prev) && prev.length <= 32);

    for (const token of line.match(HEX_TOKEN) ?? []) {
      const body = token.slice(2);
      if (body.length !== 40) continue;
      const { fixed, changed } = repairHex(body);
      const address = `0x${fixed}`;
      if (!isAddress(address, { strict: false })) continue;

      // viem accepts an all-lowercase address under `strict`, so compare against the canonical
      // form ourselves: only an exact match means a real EIP-55 checksum was printed and holds.
      const canonical = getAddress(address);
      const mixedCase = fixed !== fixed.toLowerCase() && fixed !== fixed.toUpperCase();
      if (address === canonical) {
        // The checksum confirms every character, repaired ones included.
        candidates.push({ value: canonical, confidence: "high", labelled });
      } else {
        // Mixed case means a checksum was printed and does not match what we read. No case at all
        // means there is nothing to verify, so a repaired character stays unproven. Keep the
        // address exactly as read so the user can compare it with the paper character by character.
        candidates.push({ value: address, confidence: mixedCase || changed ? "low" : "medium", labelled });
      }
    }
  });

  if (candidates.length === 0) return undefined;

  const labelled = candidates.filter((c) => c.labelled);
  if (labelled.length > 0) return labelled[0]!;
  if (candidates.length === 1) return candidates[0]!;
  // Several unlabelled addresses on one invoice: we cannot tell the payee from the payer.
  return { ...candidates[0]!, confidence: "low" };
}

/* ------------------------------------------------------------------ entry point */

/** Pure: same text in, same suggestions out. No network, no clock, no randomness. */
export function parseInvoiceText(text: string): ScanResult {
  const lines = lineList(text);
  const result: ScanResult = { confidence: {}, rawText: text };

  const vendor = readVendorRef(lines);
  if (vendor) {
    result.vendorRef = vendor.value;
    result.confidence.vendorRef = vendor.confidence;
  }

  const invoiceRef = readInvoiceRef(lines);
  if (invoiceRef) {
    result.invoiceRef = invoiceRef.value;
    result.confidence.invoiceRef = invoiceRef.confidence;
  }

  const recipient = readRecipient(lines);
  if (recipient) {
    result.recipient = recipient.value;
    result.confidence.recipient = recipient.confidence;
  }

  const amount = readAmount(lines);
  if (amount) {
    result.amount = amount.value;
    result.confidence.amount = amount.confidence;
  }

  return result;
}

/** Did OCR give us anything worth pre-filling? */
export function scanFoundSomething(result: ScanResult): boolean {
  return SCAN_FIELDS.some((f) => result[f] !== undefined);
}

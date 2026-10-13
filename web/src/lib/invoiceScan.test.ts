import { describe, expect, it } from "vitest";
import {
  normalizeScannedAmount,
  parseInvoiceText,
  scanFoundSomething,
  stripVendorDocWords,
} from "./invoiceScan";

/**
 * Every sample below is written the way tesseract.js actually hands text back: one line per visual
 * row, column gaps collapsed to runs of spaces, no layout information. The assertions are about
 * the two things that matter for a payment: what we fill in, and how loudly we admit we are unsure.
 */

/** Checksummed, so the parser can verify every character. */
const PAYEE = "0x4f3EDf983AC636A65A842ce7c78D9aA706d3b113";
const PAYEE_2 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OTHER = "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec";

/* ------------------------------------------------------------------ 1. clean invoice */

const CLEAN = `Kiran Design Studio
GSTIN 29ABCDE1234F1Z5
Tax Invoice

Invoice No: INV-1042
Invoice Date: 08 Oct 2026

Bill to: Northwind Labs

Design retainer, September            0.10
Total                                 0.10 USDC

Pay to wallet: ${PAYEE}
`;

describe("clean invoice", () => {
  const r = parseInvoiceText(CLEAN);

  it("reads all four fields", () => {
    expect(r.invoiceRef).toBe("INV-1042");
    expect(r.amount).toBe("0.10");
    expect(r.recipient).toBe(PAYEE);
    expect(r.vendorRef).toBe("KIRAN DESIGN STUDIO");
    expect(scanFoundSomething(r)).toBe(true);
  });

  it("trusts a labelled number, a labelled total and a checksummed address", () => {
    expect(r.confidence.invoiceRef).toBe("high");
    expect(r.confidence.amount).toBe("high");
    expect(r.confidence.recipient).toBe("high");
  });

  it("flags the vendor name, which was read by position and not from a label", () => {
    expect(r.confidence.vendorRef).toBe("medium");
  });

  it("does not take the document title or the customer as the vendor", () => {
    expect(r.vendorRef).not.toContain("INVOICE");
    expect(r.vendorRef).not.toContain("NORTHWIND");
  });

  it("keeps the raw text for the user to copy from", () => {
    expect(r.rawText).toBe(CLEAN);
  });
});

/* ------------------------------------------------------------------ 2. missing wallet */

it("leaves the recipient undefined when the invoice prints no wallet", () => {
  const r = parseInvoiceText(`Northwind Labs
Invoice No. 7781
Consulting, 4 hours
Amount due: 48.00 USDC
Bank transfer to account 00123456789, IFSC HDFC0001234
`);
  expect(r.recipient).toBeUndefined();
  expect(r.confidence.recipient).toBeUndefined();
  expect(r.invoiceRef).toBe("7781");
  expect(r.amount).toBe("48.00");
});

/* ------------------------------------------------------------------ 3. amount with commas */

it("strips thousands separators", () => {
  const r = parseInvoiceText(`Acme Supplies
Invoice #90012
Total     1,250.00 USDC
Pay to wallet ${PAYEE}
`);
  expect(r.amount).toBe("1250.00");
  expect(r.invoiceRef).toBe("90012");
});

/* ------------------------------------------------------------------ 4. "$1,250.00" */

it("accepts a dollar sign and prefers Balance due over a plain line total", () => {
  const r = parseInvoiceText(`Brightline Media LLC
Invoice No: BL-2026-114

Line total                 $1,000.00
Late fee                      $250.00
Balance Due:               $1,250.00

Pay to wallet: ${PAYEE_2}
`);
  expect(r.amount).toBe("1250.00");
  expect(r.confidence.amount).toBe("high");
  expect(r.recipient).toBe(PAYEE_2);
});

/* ------------------------------------------------------------------ 5. O/0 and l/1 confusion */

it("repairs O->0 and l->1 inside the 0x token, and says the address needs checking", () => {
  const r = parseInvoiceText(`Northwind Supply
Invoice No INV-3311
Pay to wallet: 0x99655O7dla55bcc2695c58ba16fb37d819bOa4dc
Total 12.00 USDC
`);
  expect(r.recipient).toBe("0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc");
  expect(r.confidence.recipient).toBe("low");
  expect(r.invoiceRef).toBe("INV-3311");
});

it("does not touch O or l outside the 0x token", () => {
  const r = parseInvoiceText(`ORBIT TOOLS
Invoice No: ORB-10
Total 5.00 USDC
`);
  expect(r.vendorRef).toBe("ORBIT TOOLS");
  expect(r.invoiceRef).toBe("ORB-10");
});

/* ------------------------------------------------------------------ 6. two totals */

it("skips the subtotal and the tax line", () => {
  const r = parseInvoiceText(`Patel & Co
Invoice No: PC-55

Subtotal              1,000.00
GST 18%                 180.00
Total                 1,180.00
`);
  expect(r.amount).toBe("1180.00");
  expect(r.confidence.amount).toBe("high");
});

it("flags two totals that disagree instead of picking one quietly", () => {
  const r = parseInvoiceText(`Patel & Co
Invoice No: PC-56
Total: 1,250.00 USDC
--- page 2 ---
Total: 1,500.00 USDC
`);
  expect(r.amount).toBe("1500.00");
  expect(r.confidence.amount).toBe("low");
});

/* ------------------------------------------------------------------ 7. no invoice number */

it("leaves the invoice number undefined rather than inventing one", () => {
  const r = parseInvoiceText(`Riverbend Studio
Work done in September 2026
Pay to wallet: ${PAYEE}
Amount due: 42.00 USDC
`);
  expect(r.invoiceRef).toBeUndefined();
  expect(r.confidence.invoiceRef).toBeUndefined();
  expect(r.amount).toBe("42.00");
  expect(r.recipient).toBe(PAYEE);
});

/* ------------------------------------------------------------------ 8. Hindi/English labels */

it("reads mixed Hindi and English labels", () => {
  const r = parseInvoiceText(`किरण स्टूडियो
प्रेषक / From: Kiran Studio
बिल संख्या / Bill No: INV-77
कुल / Total: 500.00 USDC
Pay to wallet: ${PAYEE_2}
`);
  expect(r.vendorRef).toBe("KIRAN STUDIO");
  expect(r.confidence.vendorRef).toBe("high");
  expect(r.invoiceRef).toBe("INV-77");
  expect(r.amount).toBe("500.00");
  expect(r.recipient).toBe(PAYEE_2);
});

/* ------------------------------------------------------------------ 9. broken checksum */

it("marks a mixed-case address whose checksum fails as low confidence", () => {
  const broken = "0x4f3EDf983AC636A65A842ce7c78D9aA706d3B113";
  const r = parseInvoiceText(`Acme
Invoice No: A-1
Pay to wallet: ${broken}
Total 1.00 USDC
`);
  expect(r.recipient).toBe(broken);
  expect(r.confidence.recipient).toBe("low");
});

/* ------------------------------------------------------------------ 10. several addresses */

it("prefers the address next to a Pay to label", () => {
  const r = parseInvoiceText(`Acme Supplies
Invoice No: INV-9001
Reference hash ${OTHER}
Pay to wallet: ${PAYEE_2}
Total: 75.00 USDC
`);
  expect(r.recipient).toBe(PAYEE_2);
  expect(r.confidence.recipient).toBe("high");
});

it("flags several unlabelled addresses because the payee cannot be told apart", () => {
  const r = parseInvoiceText(`Notes
${OTHER}
${PAYEE_2}
`);
  expect(r.recipient).toBe(OTHER);
  expect(r.confidence.recipient).toBe("low");
});

/* ------------------------------------------------------------------ 11. nothing readable */

it("returns no payment fields from unreadable text", () => {
  const r = parseInvoiceText(`Scanned with a phone camera
~~~~~~~~~~~~~~~~
no text could be read
`);
  expect(r.invoiceRef).toBeUndefined();
  expect(r.recipient).toBeUndefined();
  expect(r.amount).toBeUndefined();
  expect(r.confidence.vendorRef).not.toBe("high");
});

/* ------------------------------------------------------------------ 12. amount shapes */

describe("amount normalization", () => {
  it("reads European separators", () => {
    expect(normalizeScannedAmount("1.250,00")).toBe("1250.00");
  });

  it("reads a lone comma as a decimal point when it is not a thousands group", () => {
    expect(normalizeScannedAmount("0,10")).toBe("0.10");
    expect(normalizeScannedAmount("1,250")).toBe("1250.00");
  });

  it("trims trailing zeros past six decimals but refuses to round real digits", () => {
    expect(normalizeScannedAmount("12.5000000")).toBe("12.50");
    expect(normalizeScannedAmount("12.5000001")).toBeUndefined();
  });

  it("refuses zero, junk and anything the pay flow would reject", () => {
    expect(normalizeScannedAmount("0.00")).toBeUndefined();
    expect(normalizeScannedAmount("12.3.4")).toBeUndefined();
    expect(normalizeScannedAmount("-5")).toBeUndefined();
    expect(normalizeScannedAmount("O.1O")).toBeUndefined();
  });

  it("does not read a percentage as the total", () => {
    const r = parseInvoiceText(`Acme
Invoice No: A-2
Total discount 10% applied
`);
    expect(r.amount).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ 13. purity */

it("is pure: the same text gives the same suggestions", () => {
  expect(parseInvoiceText(CLEAN)).toEqual(parseInvoiceText(CLEAN));
});
/* ------------------------------------------------------------------ 14. the document word on the letterhead */

/**
 * Reported from a real scan: the letterhead read "PixelForge Studio    INVOICE" on one line, so
 * the vendor reference came back as "PIXELFORGE STUDIO INVOICE". The vendor reference derives the
 * invoice key, so that is a different invoice from the same bill typed in by hand.
 */
describe("the vendor name drops a trailing document word", () => {
  it("fixes the reported scan", () => {
    const r = parseInvoiceText(`PixelForge Studio    INVOICE
Invoice No: PF-2291
Total  12.00 USDC
Pay to wallet: ${PAYEE}
`);
    expect(r.vendorRef).toBe("PIXELFORGE STUDIO");
  });

  it("drops each of the words a bill is titled with", () => {
    expect(stripVendorDocWords("PixelForge Studio INVOICE")).toBe("PixelForge Studio");
    expect(stripVendorDocWords("PixelForge Studio TAX INVOICE")).toBe("PixelForge Studio");
    expect(stripVendorDocWords("Sharma Traders BILL")).toBe("Sharma Traders");
    expect(stripVendorDocWords("Sharma Traders RECEIPT")).toBe("Sharma Traders");
    expect(stripVendorDocWords("Sharma Traders CASH MEMO")).toBe("Sharma Traders");
    expect(stripVendorDocWords("Sharma Traders ORIGINAL")).toBe("Sharma Traders");
    expect(stripVendorDocWords("Sharma Traders DUPLICATE")).toBe("Sharma Traders");
  });

  it("copes with punctuation, lower case and two words stacked up", () => {
    expect(stripVendorDocWords("Acme Ltd - Tax Invoice")).toBe("Acme Ltd");
    expect(stripVendorDocWords("Acme Ltd (CASH MEMO)")).toBe("Acme Ltd");
    expect(stripVendorDocWords("Acme Ltd invoice")).toBe("Acme Ltd");
    expect(stripVendorDocWords("Acme Ltd Tax Invoice Original")).toBe("Acme Ltd");
    expect(stripVendorDocWords("Orbit Tools Invoice INV-1042")).toBe("Orbit Tools");
  });

  it("only strips the tail: a name that contains the word keeps it", () => {
    expect(stripVendorDocWords("Bill Hicks Design")).toBe("Bill Hicks Design");
    expect(stripVendorDocWords("Invoice Ninja Pvt Ltd")).toBe("Invoice Ninja Pvt Ltd");
    expect(stripVendorDocWords("Receipt Printing Co")).toBe("Receipt Printing Co");
  });

  it("refuses a line that is nothing but the document word", () => {
    expect(stripVendorDocWords("TAX INVOICE")).toBe("");
    expect(stripVendorDocWords("CASH MEMO")).toBe("");
    // "CASH MEMO" is not one of the document titles the letterhead scan already skips, so before
    // the strip it was read as the vendor's name.
    const r = parseInvoiceText(`CASH MEMO
Invoice No: X-9
Total 1.00
`);
    expect(r.vendorRef).toBeUndefined();
  });

  it("keeps the labelled vendor clean too", () => {
    const r = parseInvoiceText(`ACME HOLDINGS
Billed from: Kiran Studio - Tax Invoice
Invoice No: K-12
Total 0.50
`);
    expect(r.vendorRef).toBe("KIRAN STUDIO");
    expect(r.confidence.vendorRef).toBe("high");
  });
});

import { describe, expect, it } from "vitest";
import { deriveInvoiceKey, importInvoicesCsv, invoicesToCsv, normalizeRef, validateInvoice } from "./invoice";
import { formatUsdc, parseUsdc } from "./usdc";

const VENDOR = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

describe("invoice key", () => {
  it("matches the value pinned in contracts/test/SettleOnce.t.sol", () => {
    expect(deriveInvoiceKey("VENDOR-7", "INV-1042")).toBe(
      "0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b",
    );
  });

  it("normalizes case and whitespace so retyped refs map to the same key", () => {
    expect(normalizeRef("  inv   1042 ")).toBe("INV 1042");
    expect(deriveInvoiceKey(" vendor-7", "inv-1042 ")).toBe(deriveInvoiceKey("VENDOR-7", "INV-1042"));
  });

  it("does not depend on recipient or amount", () => {
    const a = validateInvoice({ vendorRef: "V", invoiceRef: "I", recipient: VENDOR, amount: "1" });
    const b = validateInvoice({ vendorRef: "V", invoiceRef: "I", recipient: OTHER, amount: "2" });
    expect(a.ok && b.ok && a.invoice.key === b.invoice.key).toBe(true);
  });
});

describe("usdc amounts", () => {
  it("0.10 USDC is 100,000 base units", () => {
    const r = parseUsdc("0.10");
    expect(r.ok && r.units).toBe(100_000n);
  });

  it("rejects ambiguous input", () => {
    for (const bad of ["", "0", "1,000", "-1", "1e3", "0.1234567", "abc"]) expect(parseUsdc(bad).ok).toBe(false);
  });

  it("formats for humans", () => {
    expect(formatUsdc(100_000n)).toBe("0.10");
    expect(formatUsdc(1_234_567_890n)).toBe("1,234.56789");
  });
});

describe("csv import", () => {
  const csv = [
    "vendor_ref,invoice_ref,recipient,amount_usdc",
    `VENDOR-7,INV-1042,${VENDOR},0.10`,
    `VENDOR-7,INV-1043,${OTHER},"2.50"`,
  ].join("\r\n");

  it("round-trips through export", () => {
    const first = importInvoicesCsv(csv);
    expect(first.problems).toEqual([]);
    const again = importInvoicesCsv(invoicesToCsv(first.invoices));
    expect(again.invoices.map((i) => i.key)).toEqual(first.invoices.map((i) => i.key));
  });

  it("keeps keys stable when rows are reordered", () => {
    const [header, a, b] = csv.split("\r\n");
    const reordered = importInvoicesCsv([header, b, a].join("\n"));
    const original = importInvoicesCsv(csv);
    expect(new Set(reordered.invoices.map((i) => i.key))).toEqual(new Set(original.invoices.map((i) => i.key)));
  });

  it("drops exact duplicates and flags conflicting ones", () => {
    const withDupes = `${csv}\nvendor-7,inv-1042,${VENDOR},0.1\nVENDOR-7,INV-1042,${VENDOR},0.20\n`;
    const r = importInvoicesCsv(withDupes);
    expect(r.invoices).toHaveLength(2);
    expect(r.skippedDuplicates).toBe(1);
    expect(r.problems).toHaveLength(1);
  });

  it("reports missing columns", () => {
    expect(importInvoicesCsv("vendor_ref,invoice_ref\nA,B").problems[0]?.message).toMatch(/recipient/);
  });
});

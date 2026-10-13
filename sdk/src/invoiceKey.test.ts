import { describe, expect, it } from "vitest";
import { checkRef, deriveInvoiceKey, normalizeRef } from "./invoiceKey.ts";

/** The vector pinned in contracts/test/SettleOnce.t.sol and web/src/lib/invoice.test.ts. */
const PINNED = "0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b";

describe("deriveInvoiceKey", () => {
  it("matches the key pinned in the contract and the web app", () => {
    expect(deriveInvoiceKey("VENDOR-7", "INV-1042")).toBe(PINNED);
  });

  it("gives the same key however the references were typed", () => {
    expect(deriveInvoiceKey("  vendor-7 ", "inv-1042")).toBe(PINNED);
    expect(deriveInvoiceKey("Vendor-7", "Inv-1042")).toBe(PINNED);
  });

  it("collapses inner whitespace, so a retyped reference is the same invoice", () => {
    expect(deriveInvoiceKey("ACME CORP", "INV 1042")).toBe(deriveInvoiceKey("  acme   corp ", "inv  1042"));
  });

  it("keeps different references apart, including a swap of the two", () => {
    expect(deriveInvoiceKey("VENDOR-7", "INV-1043")).not.toBe(PINNED);
    expect(deriveInvoiceKey("INV-1042", "VENDOR-7")).not.toBe(PINNED);
  });

  it("does not let a separator be smuggled across the two fields", () => {
    // abi.encode length-prefixes each string, so these can never collide.
    expect(deriveInvoiceKey("A", "BC")).not.toBe(deriveInvoiceKey("AB", "C"));
  });

  it("returns a 32-byte hex key", () => {
    expect(deriveInvoiceKey("V", "I")).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("normalizeRef", () => {
  it("normalizes case, edges and inner runs of whitespace", () => {
    expect(normalizeRef("  inv   1042 ")).toBe("INV 1042");
  });

  it("applies NFKC, so a full-width reference is the same reference", () => {
    expect(normalizeRef("ＩＮＶ-1042")).toBe("INV-1042");
  });
});

describe("checkRef", () => {
  it("accepts an ordinary reference", () => {
    expect(checkRef("INV-1042", "Invoice number")).toBeUndefined();
  });

  it("refuses an empty reference, a too-long one and control characters", () => {
    expect(checkRef("   ", "Invoice number")).toMatch(/required/);
    expect(checkRef("X".repeat(65), "Invoice number")).toMatch(/64 characters or fewer/);
    expect(checkRef("INV\u0001042", "Invoice number")).toMatch(/control characters/);
  });
});

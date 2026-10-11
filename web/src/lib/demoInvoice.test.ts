import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { DEMO_AMOUNT, DEMO_REF_RANDOM_LENGTH, DEMO_VENDOR_REF, demoInvoice, demoInvoiceRef } from "./demoInvoice";
import { deriveInvoiceKey, MAX_REF_LENGTH, validateInvoice } from "./invoice";
import { parseUsdc } from "./usdc";

const PAYER = getAddress("0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF");

/** A random() that walks a fixed list, so a generated reference can be asserted exactly. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("demoInvoiceRef", () => {
  it("is DEMO- plus six uppercase letters", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(demoInvoiceRef()).toMatch(/^DEMO-[A-Z]{6}$/);
    }
  });

  it("maps the random stream onto letters", () => {
    expect(demoInvoiceRef(seeded([0]))).toBe("DEMO-AAAAAA");
    expect(demoInvoiceRef(seeded([0.99]))).toBe("DEMO-ZZZZZZ");
    expect(demoInvoiceRef(seeded([0, 0.5, 0.99, 0, 0.5, 0.99]))).toBe("DEMO-ANZANZ");
  });

  it("stays in range at the edges of random()", () => {
    expect(demoInvoiceRef(seeded([1]))).toBe("DEMO-ZZZZZZ");
    expect(demoInvoiceRef(seeded([0.999999]))).toBe("DEMO-ZZZZZZ");
    expect(demoInvoiceRef(seeded([0]))).toBe("DEMO-AAAAAA");
  });

  it("gives a fresh reference each press, so each demo is a new invoice key", () => {
    // 26^6 possibilities, so 200 draws collapsing to a handful would mean a broken generator.
    // Not asserted as exactly 200: a real collision is possible, just vanishingly unlikely.
    const refs = new Set(Array.from({ length: 200 }, () => demoInvoiceRef()));
    expect(refs.size).toBeGreaterThan(190);
  });

  it("derives a different invoice key for each reference", () => {
    const a = demoInvoiceRef(seeded([0]));
    const b = demoInvoiceRef(seeded([0.5]));
    expect(deriveInvoiceKey(DEMO_VENDOR_REF, a)).not.toBe(deriveInvoiceKey(DEMO_VENDOR_REF, b));
  });
});

describe("demoInvoice", () => {
  it("pays the connected wallet, 0.01 USDC, from the demo vendor", () => {
    expect(demoInvoice(PAYER, seeded([0]))).toEqual({
      vendorRef: "DEMO-VENDOR",
      invoiceRef: "DEMO-AAAAAA",
      recipient: PAYER,
      amount: "0.01",
    });
  });

  it("leaves the recipient empty when no wallet is connected", () => {
    expect(demoInvoice(undefined, seeded([0])).recipient).toBe("");
    expect(demoInvoice().recipient).toBe("");
  });

  it("fills a form the real validator accepts", () => {
    const result = validateInvoice(demoInvoice(PAYER));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.recipient).toBe(PAYER);
    expect(result.invoice.amount).toBe(10_000n);
  });

  it("is 0.01 USDC, which is 10000 units at 6 decimals", () => {
    const amount = parseUsdc(DEMO_AMOUNT);
    expect(amount.ok).toBe(true);
    if (!amount.ok) return;
    expect(amount.units).toBe(10_000n);
  });

  it("is rejected without a recipient, so an unconnected demo can't be added by accident", () => {
    const result = validateInvoice(demoInvoice(undefined));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.recipient).toBeTruthy();
  });

  it("keeps both references well inside the length limit", () => {
    const input = demoInvoice(PAYER);
    expect(input.vendorRef.length).toBeLessThanOrEqual(MAX_REF_LENGTH);
    expect(input.invoiceRef.length).toBe("DEMO-".length + DEMO_REF_RANDOM_LENGTH);
    expect(input.invoiceRef.length).toBeLessThanOrEqual(MAX_REF_LENGTH);
  });

  it("is already normalized, so the typed reference and the derived key agree", () => {
    const input = demoInvoice(PAYER);
    expect(deriveInvoiceKey(input.vendorRef, input.invoiceRef)).toBe(
      deriveInvoiceKey(input.vendorRef.toLowerCase(), input.invoiceRef.toLowerCase()),
    );
  });
});

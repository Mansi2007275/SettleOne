import { getAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { deriveInvoiceKey } from "./invoice";
import { originFromRequest, paidBody, parsePaidQuery } from "./paidApi";
import type { Settlement } from "./settlement";

const PAYER = getAddress("0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF");
const RECIPIENT = getAddress("0x5B38Da6a701c568545dCfcB03FcB875f56beddC4");
const ZERO = `0x${"0".repeat(40)}` as Address;
const KEY = deriveInvoiceKey("VENDOR-7", "INV-1042");

const unpaid: Settlement = { recipient: ZERO, paidAtBlock: 0n, amount: 0n, paidAt: 0n };
const paid: Settlement = { recipient: RECIPIENT, paidAtBlock: 4_210n, amount: 20_000n, paidAt: 1_760_000_000n };

const ok = (params: Parameters<typeof parsePaidQuery>[0]) => {
  const result = parsePaidQuery(params);
  if (!result.ok) throw new Error(`expected a valid query, got: ${result.error}`);
  return result.query;
};

describe("parsePaidQuery", () => {
  it("derives the same key as the desk and the contract", () => {
    expect(ok({ payer: PAYER, vendor: "VENDOR-7", invoice: "INV-1042" }).invoiceKey).toBe(
      "0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b",
    );
  });

  it("normalizes the references, so a retyped query hits the same invoice", () => {
    const query = ok({ payer: PAYER, vendor: "  vendor-7 ", invoice: "inv-1042" });
    expect(query.vendorRef).toBe("VENDOR-7");
    expect(query.invoiceRef).toBe("INV-1042");
    expect(query.invoiceKey).toBe(KEY);
  });

  it("checksums the payer, whatever case it arrived in", () => {
    expect(ok({ payer: PAYER.toLowerCase(), vendor: "V", invoice: "I" }).payer).toBe(PAYER);
  });

  it("names the missing parameter", () => {
    expect(parsePaidQuery({})).toEqual({ ok: false, error: "payer is required: the wallet that paid." });
    expect(parsePaidQuery({ payer: PAYER })).toMatchObject({ ok: false });
    expect(parsePaidQuery({ payer: PAYER, vendor: "V" })).toEqual({
      ok: false,
      error: "invoice is required: the invoice number.",
    });
  });

  it("treats whitespace-only parameters as missing", () => {
    expect(parsePaidQuery({ payer: "   ", vendor: "V", invoice: "I" })).toMatchObject({ ok: false });
    expect(parsePaidQuery({ payer: PAYER, vendor: "   ", invoice: "I" })).toMatchObject({ ok: false });
    expect(parsePaidQuery({ payer: PAYER, vendor: "V", invoice: " \t " })).toMatchObject({ ok: false });
  });

  it("refuses a payer that is not an address", () => {
    expect(parsePaidQuery({ payer: "0x123", vendor: "V", invoice: "I" })).toEqual({
      ok: false,
      error: 'payer "0x123" is not a 0x address.',
    });
    expect(parsePaidQuery({ payer: "acme.eth", vendor: "V", invoice: "I" })).toMatchObject({ ok: false });
  });

  it("refuses references longer than the contract's keys are ever built from", () => {
    expect(parsePaidQuery({ payer: PAYER, vendor: "X".repeat(65), invoice: "I" })).toMatchObject({
      ok: false,
      error: "vendor must be 64 characters or fewer.",
    });
    expect(parsePaidQuery({ payer: PAYER, vendor: "V", invoice: "X".repeat(65) })).toMatchObject({ ok: false });
  });

  it("accepts null parameters, as a missing search param arrives", () => {
    expect(parsePaidQuery({ payer: null, vendor: null, invoice: null })).toMatchObject({ ok: false });
  });
});

describe("paidBody", () => {
  const query = ok({ payer: PAYER, vendor: "VENDOR-7", invoice: "INV-1042" });

  it("reports an unpaid invoice as nulls, not zeros", () => {
    const body = paidBody({ query, settlement: unpaid, origin: "https://settleonce.app" });
    expect(body).toEqual({
      paid: false,
      recipient: null,
      amountUsdc: null,
      paidAtBlock: null,
      invoiceKey: KEY,
      receiptUrl: `https://settleonce.app/receipt/${PAYER}/${KEY}?v=VENDOR-7&i=INV-1042`,
    });
  });

  it("reports a paid invoice with the contract's own details", () => {
    const body = paidBody({ query, settlement: paid, origin: "https://settleonce.app" });
    expect(body).toMatchObject({
      paid: true,
      recipient: RECIPIENT,
      amountUsdc: "0.02",
      paidAtBlock: "4210",
      invoiceKey: KEY,
    });
  });

  it("sends the block as a string, so no block number is rounded in JSON", () => {
    const huge = 9_007_199_254_740_993n; // past Number.MAX_SAFE_INTEGER
    const body = paidBody({ query, settlement: { ...paid, paidAtBlock: huge }, origin: "https://x.test" });
    expect(body.paidAtBlock).toBe("9007199254740993");
    expect(JSON.parse(JSON.stringify(body)).paidAtBlock).toBe("9007199254740993");
  });

  it("prints the amount from base units, with no thousands separators", () => {
    expect(paidBody({ query, settlement: { ...paid, amount: 1_250_500_000n }, origin: "https://x.test" }).amountUsdc).toBe(
      "1250.50",
    );
    expect(paidBody({ query, settlement: { ...paid, amount: 1n }, origin: "https://x.test" }).amountUsdc).toBe(
      "0.000001",
    );
  });

  it("checksums a lower-case recipient from the chain", () => {
    const body = paidBody({
      query,
      settlement: { ...paid, recipient: RECIPIENT.toLowerCase() as Address },
      origin: "https://x.test",
    });
    expect(body.recipient).toBe(RECIPIENT);
  });

  it("builds a receipt link that carries the references and survives a trailing slash", () => {
    expect(paidBody({ query, settlement: paid, origin: "https://settleonce.app/" }).receiptUrl).toBe(
      `https://settleonce.app/receipt/${PAYER}/${KEY}?v=VENDOR-7&i=INV-1042`,
    );
  });

  it("escapes references in the receipt link", () => {
    const tricky = ok({ payer: PAYER, vendor: "A&B", invoice: "10/42?x" });
    const body = paidBody({ query: tricky, settlement: unpaid, origin: "https://x.test" });
    expect(body.receiptUrl).toContain("?v=A%26B&i=10%2F42%3FX");
  });

  it("is JSON-safe: no bigint survives into the body", () => {
    const body = paidBody({ query, settlement: paid, origin: "https://x.test" });
    expect(() => JSON.stringify(body)).not.toThrow();
  });
});

describe("originFromRequest", () => {
  const headers = (map: Record<string, string>) => ({ get: (name: string) => map[name.toLowerCase()] ?? null });

  it("prefers the forwarded host a proxy set", () => {
    expect(
      originFromRequest("http://10.0.0.5:3000/api/paid", {
        get: (n) => ({ "x-forwarded-host": "settleonce.app", "x-forwarded-proto": "https" })[n.toLowerCase()] ?? null,
      }),
    ).toBe("https://settleonce.app");
  });

  it("takes the first protocol when a chain of proxies listed several", () => {
    expect(
      originFromRequest("http://internal/api/paid", headers({ "x-forwarded-host": "a.test", "x-forwarded-proto": "https, http" })),
    ).toBe("https://a.test");
  });

  it("falls back to the plain host header, assuming http only on localhost", () => {
    expect(originFromRequest("http://x/api/paid", headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(originFromRequest("http://x/api/paid", headers({ host: "settleonce.app" }))).toBe("https://settleonce.app");
  });

  it("falls back to the request URL when there are no headers at all", () => {
    expect(originFromRequest("https://settleonce.app/api/paid?payer=0x1", headers({}))).toBe("https://settleonce.app");
  });

  it("returns an empty origin rather than throwing on a URL it cannot read", () => {
    expect(originFromRequest("not a url", headers({}))).toBe("");
  });
});

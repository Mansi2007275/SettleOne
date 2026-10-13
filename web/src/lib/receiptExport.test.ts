import { getAddress, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { deriveInvoiceKey } from "./invoice";
import {
  buildReceiptExport,
  receiptFileBase,
  receiptJsonText,
  receiptPath,
  receiptPdfLines,
  receiptRefLine,
  refsMatchingKey,
  RECEIPT_EXPORT_SCHEMA,
  type ReceiptExportFacts,
} from "./receiptExport";
import type { Settlement } from "./settlement";

const PAYER = getAddress("0x5B38Da6a701c568545dCfcB03FcB875f56beddC4");
const RECIPIENT = getAddress("0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF");
const CONTRACT = getAddress("0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2");
const TX: Hex = "0xaaaabbbbccccddddeeeeffff000011112222333344445555666677778888aaaa";

const VENDOR = "ACME Supplies";
const INVOICE = "INV-1042";
const KEY = deriveInvoiceKey(VENDOR, INVOICE);

const settlement: Settlement = {
  recipient: RECIPIENT,
  amount: 1_250_000_000n, // 1,250.00 USDC
  paidAtBlock: 4_210n,
  paidAt: 1_760_000_000n, // 2025-10-09T08:53:20Z
};

function facts(over: Partial<ReceiptExportFacts> = {}): ReceiptExportFacts {
  return {
    network: "testnet",
    chainName: "Arc Testnet",
    chainId: 5_042_002,
    contract: CONTRACT,
    payer: PAYER,
    invoiceKey: KEY,
    claimedRefs: { vendorRef: VENDOR, invoiceRef: INVOICE },
    settlement,
    txHash: TX,
    explorerUrl: "https://explorer.testnet.arc.io",
    receiptUrl: `https://settleonce.app/receipt/${PAYER}/${KEY}?v=ACME+Supplies&i=INV-1042`,
    generatedAt: new Date("2026-10-12T09:30:00.000Z"),
    ...over,
  };
}

describe("buildReceiptExport", () => {
  it("writes out every fact from the contract read", () => {
    expect(buildReceiptExport(facts())).toEqual({
      schema: RECEIPT_EXPORT_SCHEMA,
      network: "testnet",
      chainName: "Arc Testnet",
      chainId: 5_042_002,
      contract: CONTRACT,
      payer: PAYER,
      invoiceKey: KEY,
      vendorRef: "ACME SUPPLIES",
      invoiceRef: "INV-1042",
      recipient: RECIPIENT,
      amountUsdc: "1250.00",
      amountUnits: "1250000000",
      paidAtBlock: "4210",
      paidAtIso: "2025-10-09T08:53:20.000Z",
      txHash: TX,
      receiptUrl: facts().receiptUrl,
      links: {
        contract: `https://explorer.testnet.arc.io/address/${CONTRACT}`,
        payer: `https://explorer.testnet.arc.io/address/${PAYER}`,
        recipient: `https://explorer.testnet.arc.io/address/${RECIPIENT}`,
        block: "https://explorer.testnet.arc.io/block/4210",
        tx: `https://explorer.testnet.arc.io/tx/${TX}`,
      },
      generatedAt: "2026-10-12T09:30:00.000Z",
    });
  });

  it("keeps the amount exact: units are the integer, never a float", () => {
    const receipt = buildReceiptExport(facts({ settlement: { ...settlement, amount: 100_000n } }));
    expect(receipt.amountUnits).toBe("100000");
    expect(receipt.amountUsdc).toBe("0.10");
  });

  it("writes amountUsdc without thousands separators, so it parses again", () => {
    const receipt = buildReceiptExport(facts());
    expect(receipt.amountUsdc).not.toContain(",");
    expect(Number(receipt.amountUsdc)).toBe(1250);
  });

  it("normalizes the references it accepts", () => {
    const claimedRefs = { vendorRef: "  acme   supplies ", invoiceRef: "inv-1042" };
    const receipt = buildReceiptExport(facts({ claimedRefs }));
    expect(receipt.vendorRef).toBe("ACME SUPPLIES");
    expect(receipt.invoiceRef).toBe("INV-1042");
  });

  it("leaves the references out when they do not derive the key", () => {
    const receipt = buildReceiptExport(facts({ claimedRefs: { vendorRef: VENDOR, invoiceRef: "INV-9999" } }));
    expect(receipt).not.toHaveProperty("vendorRef");
    expect(receipt).not.toHaveProperty("invoiceRef");
    expect(receiptJsonText(receipt)).not.toContain("INV-9999");
  });

  it("leaves the references out when the URL carried none", () => {
    const receipt = buildReceiptExport(facts({ claimedRefs: null }));
    expect(receipt).not.toHaveProperty("vendorRef");
    expect(receipt).not.toHaveProperty("invoiceRef");
  });

  it("matches the key whatever case the URL used for it", () => {
    const shouted = `0x${KEY.slice(2).toUpperCase()}` as Hex;
    expect(buildReceiptExport(facts({ invoiceKey: shouted })).vendorRef).toBe("ACME SUPPLIES");
  });

  it("records a missing transaction as null, with no link", () => {
    const receipt = buildReceiptExport(facts({ txHash: null }));
    expect(receipt.txHash).toBeNull();
    expect(receipt.links.tx).toBeNull();
  });

  it("refuses a receipt that was never settled", () => {
    expect(() => buildReceiptExport(facts({ settlement: { ...settlement, paidAtBlock: 0n } }))).toThrow(/settled/);
  });
});

describe("refsMatchingKey", () => {
  it("accepts references that derive the key and normalizes them", () => {
    expect(refsMatchingKey({ vendorRef: " acme supplies ", invoiceRef: "inv-1042" }, KEY)).toEqual({
      vendorRef: "ACME SUPPLIES",
      invoiceRef: "INV-1042",
    });
  });

  it("rejects a swapped pair", () => {
    expect(refsMatchingKey({ vendorRef: INVOICE, invoiceRef: VENDOR }, KEY)).toBeNull();
  });

  it("rejects null", () => {
    expect(refsMatchingKey(null, KEY)).toBeNull();
  });
});

describe("receiptPath", () => {
  it("carries both references, URL-encoded", () => {
    expect(receiptPath(PAYER, KEY, { vendorRef: "ACME SUPPLIES", invoiceRef: "INV-1042" })).toBe(
      `/receipt/${PAYER}/${KEY}?v=ACME%20SUPPLIES&i=INV-1042`,
    );
  });

  it("escapes characters that would break the query string", () => {
    expect(receiptPath(PAYER, KEY, { vendorRef: "A&B", invoiceRef: "10/42?x" })).toBe(
      `/receipt/${PAYER}/${KEY}?v=A%26B&i=10%2F42%3Fx`,
    );
  });

  it("is just the path when there are no references", () => {
    expect(receiptPath(PAYER, KEY, null)).toBe(`/receipt/${PAYER}/${KEY}`);
  });
});

describe("receiptJsonText", () => {
  it("is pretty-printed, newline-terminated and parses back to the same object", () => {
    const receipt = buildReceiptExport(facts());
    const text = receiptJsonText(receipt);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "invoiceKey":');
    expect(JSON.parse(text)).toEqual(receipt);
  });
});

describe("receiptFileBase", () => {
  it("uses the verified invoice number and the block", () => {
    expect(receiptFileBase(buildReceiptExport(facts()))).toBe("settleonce-receipt-inv-1042-4210");
  });

  it("falls back to the short key when the references were not verified", () => {
    const receipt = buildReceiptExport(facts({ claimedRefs: null }));
    expect(receiptFileBase(receipt)).toBe(`settleonce-receipt-${KEY.slice(0, 10)}-4210`);
  });

  it("makes a filename-safe slug out of an awkward invoice number", () => {
    const vendorRef = "Acme";
    const invoiceRef = "INV 10/42 #B";
    const invoiceKey = deriveInvoiceKey(vendorRef, invoiceRef);
    const receipt = buildReceiptExport(facts({ invoiceKey, claimedRefs: { vendorRef, invoiceRef } }));
    expect(receiptFileBase(receipt)).toBe("settleonce-receipt-inv-10-42-b-4210");
  });

  it("falls back to the key when the invoice number slugs away to nothing", () => {
    const vendorRef = "Acme";
    const invoiceRef = "///";
    const invoiceKey = deriveInvoiceKey(vendorRef, invoiceRef);
    const receipt = buildReceiptExport(facts({ invoiceKey, claimedRefs: { vendorRef, invoiceRef } }));
    expect(receiptFileBase(receipt)).toBe(`settleonce-receipt-${invoiceKey.slice(0, 10)}-4210`);
  });

  it("never produces a path separator or a space", () => {
    const vendorRef = "Acme";
    const invoiceRef = "a/b\\c d:e";
    const invoiceKey = deriveInvoiceKey(vendorRef, invoiceRef);
    const receipt = buildReceiptExport(facts({ invoiceKey, claimedRefs: { vendorRef, invoiceRef } }));
    expect(receiptFileBase(receipt)).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("receiptPdfLines", () => {
  it("carries every line the slip shows, in the same order", () => {
    const lines = receiptPdfLines(buildReceiptExport(facts()));
    expect(lines.map((l) => l.label)).toEqual([
      "Invoice key",
      "Payer",
      "Paid to",
      "Amount",
      "Block",
      "Time (UTC)",
      "Transaction",
      "Contract",
      "Network",
    ]);
    expect(lines.find((l) => l.label === "Amount")?.value).toBe("1250.00 USDC");
    expect(lines.find((l) => l.label === "Transaction")?.value).toBe(TX);
  });

  it("says so rather than leaving the transaction blank", () => {
    const lines = receiptPdfLines(buildReceiptExport(facts({ txHash: null })));
    expect(lines.find((l) => l.label === "Transaction")?.value).toBe("not found in that block");
  });

  it("has no empty value", () => {
    for (const line of receiptPdfLines(buildReceiptExport(facts({ txHash: null, claimedRefs: null })))) {
      expect(line.value.length).toBeGreaterThan(0);
    }
  });
});

describe("receiptRefLine", () => {
  it("joins verified references", () => {
    expect(receiptRefLine(buildReceiptExport(facts()))).toBe("ACME SUPPLIES / INV-1042");
  });

  it("is null without verified references", () => {
    expect(receiptRefLine(buildReceiptExport(facts({ claimedRefs: null })))).toBeNull();
  });
});

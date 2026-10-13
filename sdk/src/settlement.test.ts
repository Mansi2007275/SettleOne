import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { deriveInvoiceKey } from "./invoiceKey.ts";
import { decidePayAction, toReceipt, type Settlement } from "./settlement.ts";

const PAYER: Address = "0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF";
const RECIPIENT: Address = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";
const OTHER: Address = "0x1111111111111111111111111111111111111111";
const ZERO: Address = `0x${"0".repeat(40)}`;
const KEY = deriveInvoiceKey("VENDOR-7", "INV-1042");
const AMOUNT = 20_000n; // 0.02 USDC

const unpaid: Settlement = { recipient: ZERO, paidAtBlock: 0n, amount: 0n, paidAt: 0n };
const paid: Settlement = { recipient: RECIPIENT, paidAtBlock: 4_210n, amount: AMOUNT, paidAt: 1_760_000_000n };

describe("toReceipt", () => {
  it("reads an unsettled key as unpaid", () => {
    const receipt = toReceipt(PAYER, KEY, unpaid);
    expect(receipt.paid).toBe(false);
    expect(receipt.paidAtBlock).toBe(0n);
    expect(receipt.amount).toBe(0n);
  });

  it("keeps the exact base units and adds a printable amount", () => {
    const receipt = toReceipt(PAYER, KEY, paid);
    expect(receipt).toMatchObject({
      paid: true,
      payer: PAYER,
      invoiceKey: KEY,
      recipient: RECIPIENT,
      amount: AMOUNT,
      amountUsdc: "0.02",
      paidAtBlock: 4_210n,
      paidAt: 1_760_000_000n,
    });
  });

  it("treats block 1 as paid: only block 0 means never settled", () => {
    expect(toReceipt(PAYER, KEY, { ...paid, paidAtBlock: 1n }).paid).toBe(true);
  });
});

describe("decidePayAction", () => {
  const receipt = (s: Settlement) => toReceipt(PAYER, KEY, s);

  it("pays an invoice the chain has never settled", () => {
    expect(decidePayAction({ receipt: receipt(unpaid), recipient: RECIPIENT, amount: AMOUNT })).toBe("pay");
  });

  it("is already-paid when the chain holds these exact details", () => {
    expect(decidePayAction({ receipt: receipt(paid), recipient: RECIPIENT, amount: AMOUNT })).toBe("already-paid");
  });

  it("ignores address casing, so a rerun from a different file still reads as already-paid", () => {
    const lower = RECIPIENT.toLowerCase() as Address;
    expect(decidePayAction({ receipt: receipt({ ...paid, recipient: lower }), recipient: RECIPIENT, amount: AMOUNT })).toBe(
      "already-paid",
    );
  });

  it("is a conflict when the recipient was changed under a settled key", () => {
    expect(decidePayAction({ receipt: receipt(paid), recipient: OTHER, amount: AMOUNT })).toBe("conflict");
  });

  it("is a conflict when the amount was changed, even by one base unit", () => {
    expect(decidePayAction({ receipt: receipt(paid), recipient: RECIPIENT, amount: AMOUNT + 1n })).toBe("conflict");
    expect(decidePayAction({ receipt: receipt(paid), recipient: RECIPIENT, amount: AMOUNT - 1n })).toBe("conflict");
  });

  it("is a conflict when both details were changed", () => {
    expect(decidePayAction({ receipt: receipt(paid), recipient: OTHER, amount: 1n })).toBe("conflict");
  });

  it("never reports a conflict for an unpaid key, whatever the stale fields hold", () => {
    const stale = { ...unpaid, recipient: OTHER, amount: 999n };
    expect(decidePayAction({ receipt: receipt(stale), recipient: RECIPIENT, amount: AMOUNT })).toBe("pay");
  });

  it("compares amounts as bigint, not as text", () => {
    const big = { ...paid, amount: 10_000_000_000n };
    expect(decidePayAction({ receipt: receipt(big), recipient: RECIPIENT, amount: 10_000_000_000n })).toBe(
      "already-paid",
    );
    expect(decidePayAction({ receipt: receipt(big), recipient: RECIPIENT, amount: 1_000_000_000n })).toBe("conflict");
  });
});

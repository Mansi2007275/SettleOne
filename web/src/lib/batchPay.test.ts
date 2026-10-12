import { decodeFunctionData, getAddress, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { erc20Abi } from "@/abi/erc20";
import { settleOnceAbi } from "@/abi/settleOnce";
import { USDC_ADDRESS } from "@/config/env";
import { buildApproveAndPayCalls } from "./batchPay";
import { deriveInvoiceKey, type Invoice } from "./invoice";

const SETTLE_ONCE = getAddress("0x1111111111111111111111111111111111111111");
const RECIPIENT = getAddress("0x2222222222222222222222222222222222222222");

/** 12.50 USDC in 6-decimal units. */
const AMOUNT = 12_500_000n;

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    key: deriveInvoiceKey("Acme Studio", "INV-1042"),
    vendorRef: "ACME STUDIO",
    invoiceRef: "INV-1042",
    recipient: RECIPIENT,
    amount: AMOUNT,
    ...overrides,
  };
}

describe("buildApproveAndPayCalls", () => {
  it("returns approve first, then payOnce", () => {
    const calls = buildApproveAndPayCalls({ invoice: invoice(), settleOnce: SETTLE_ONCE });

    expect(calls).toHaveLength(2);
    expect(calls[0].target).toBe(USDC_ADDRESS);
    expect(calls[1].target).toBe(SETTLE_ONCE);
    expect(calls[0].callData.slice(0, 10)).toBe(toFunctionSelector("approve(address,uint256)"));
    expect(calls[1].callData.slice(0, 10)).toBe(toFunctionSelector("payOnce(bytes32,address,uint256)"));
  });

  it("makes the batch all-or-nothing", () => {
    const calls = buildApproveAndPayCalls({ invoice: invoice(), settleOnce: SETTLE_ONCE });
    expect(calls.map((c) => c.allowFailure)).toEqual([false, false]);
  });

  it("approves exactly the invoice amount, to SettleOnce and no one else", () => {
    const calls = buildApproveAndPayCalls({ invoice: invoice(), settleOnce: SETTLE_ONCE });
    const decoded = decodeFunctionData({ abi: erc20Abi, data: calls[0].callData });

    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([SETTLE_ONCE, AMOUNT]);
  });

  it("pays the invoice's own key, recipient and amount", () => {
    const inv = invoice();
    const calls = buildApproveAndPayCalls({ invoice: inv, settleOnce: SETTLE_ONCE });
    const decoded = decodeFunctionData({ abi: settleOnceAbi, data: calls[1].callData });

    expect(decoded.functionName).toBe("payOnce");
    expect(decoded.args).toEqual([inv.key, RECIPIENT, AMOUNT]);
  });

  it("approves and pays the same amount, so no allowance is left behind", () => {
    const calls = buildApproveAndPayCalls({ invoice: invoice(), settleOnce: SETTLE_ONCE });
    const approved = decodeFunctionData({ abi: erc20Abi, data: calls[0].callData }).args?.[1];
    const paid = decodeFunctionData({ abi: settleOnceAbi, data: calls[1].callData }).args?.[2];

    expect(approved).toBe(paid);
  });

  it("checksums a lower-case recipient and spender", () => {
    const calls = buildApproveAndPayCalls({
      invoice: invoice({ recipient: RECIPIENT.toLowerCase() as typeof RECIPIENT }),
      settleOnce: SETTLE_ONCE.toLowerCase() as typeof SETTLE_ONCE,
    });

    expect(calls[1].target).toBe(SETTLE_ONCE);
    expect(decodeFunctionData({ abi: settleOnceAbi, data: calls[1].callData }).args?.[1]).toBe(RECIPIENT);
    expect(decodeFunctionData({ abi: erc20Abi, data: calls[0].callData }).args?.[0]).toBe(SETTLE_ONCE);
  });

  it("is driven only by the invoice, not by the references' spelling", () => {
    const a = buildApproveAndPayCalls({ invoice: invoice(), settleOnce: SETTLE_ONCE });
    const b = buildApproveAndPayCalls({
      invoice: invoice({ vendorRef: "acme studio", invoiceRef: "inv-1042" }),
      settleOnce: SETTLE_ONCE,
    });

    expect(b).toEqual(a);
  });

  it("uses the USDC address it is given", () => {
    const usdc = getAddress("0x3333333333333333333333333333333333333333");
    const calls = buildApproveAndPayCalls({ invoice: invoice(), settleOnce: SETTLE_ONCE, usdc });

    expect(calls[0].target).toBe(usdc);
  });

  it("defaults to Arc's USDC interface", () => {
    const calls = buildApproveAndPayCalls({ invoice: invoice(), settleOnce: SETTLE_ONCE });
    expect(calls[0].target).toBe(getAddress("0x3600000000000000000000000000000000000000"));
  });

  it("refuses an amount of zero", () => {
    expect(() => buildApproveAndPayCalls({ invoice: invoice({ amount: 0n }), settleOnce: SETTLE_ONCE })).toThrow(
      /more than 0/,
    );
  });

  it("refuses to approve the token contract as its own spender", () => {
    expect(() => buildApproveAndPayCalls({ invoice: invoice(), settleOnce: USDC_ADDRESS })).toThrow(/can't be the USDC/);
  });

  it("builds the same calls every time (no time, order or randomness)", () => {
    const inv = invoice();
    expect(buildApproveAndPayCalls({ invoice: inv, settleOnce: SETTLE_ONCE })).toEqual(
      buildApproveAndPayCalls({ invoice: inv, settleOnce: SETTLE_ONCE }),
    );
  });
});

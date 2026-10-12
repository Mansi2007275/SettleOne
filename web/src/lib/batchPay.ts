import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { erc20Abi } from "@/abi/erc20";
import { settleOnceAbi } from "@/abi/settleOnce";
import { USDC_ADDRESS } from "@/config/env";
import type { Invoice } from "./invoice";

/**
 * The two calls that settle one invoice, shaped for Arc's `Multicall3From.aggregate3`.
 *
 *   1. USDC.approve(settleOnce, amount)   — exactly the invoice amount, never more
 *   2. SettleOnce.payOnce(key, recipient, amount)
 *
 * `allowFailure` is `false` on both, so the batch is all-or-nothing: if `payOnce` reverts with
 * `AlreadyPaid` or `SettlementConflict`, the approval is rolled back with it and the wallet is left
 * exactly as it was. Order matters — the approval has to land before `payOnce` calls `transferFrom`.
 *
 * Pure on purpose: it only encodes calldata, so it can be tested without a chain, a wallet or a
 * mock. Nothing here decides *whether* to batch; that is the hook's job.
 */

export type Call3 = {
  target: Address;
  allowFailure: boolean;
  callData: Hex;
};

export function buildApproveAndPayCalls({
  invoice,
  settleOnce,
  usdc = USDC_ADDRESS,
}: {
  invoice: Invoice;
  settleOnce: Address;
  /** Arc's USDC ERC-20 interface. Overridable so a test can pin the address it expects. */
  usdc?: Address;
}): [Call3, Call3] {
  if (invoice.amount <= 0n) throw new Error("Invoice amount must be more than 0.");

  const spender = getAddress(settleOnce);
  const token = getAddress(usdc);
  if (spender.toLowerCase() === token.toLowerCase()) {
    throw new Error("The SettleOnce address can't be the USDC address.");
  }

  return [
    {
      target: token,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, invoice.amount],
      }),
    },
    {
      target: spender,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: settleOnceAbi,
        functionName: "payOnce",
        args: [invoice.key, getAddress(invoice.recipient), invoice.amount],
      }),
    },
  ];
}

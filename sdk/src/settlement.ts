import type { Address, Hex, PublicClient } from "viem";
import { settleOnceAbi } from "./abi.ts";
import { formatUsdcAmount } from "./amount.ts";

/** Mirrors SettleOnce.Settlement. `paidAtBlock === 0n` means the key was never settled. */
export type Settlement = {
  recipient: Address;
  paidAtBlock: bigint;
  amount: bigint;
  paidAt: bigint;
};

/**
 * What the contract knows about one (payer, invoice key). This is the only source of paid status
 * in SettleOnce: there is no database, and nothing local is ever trusted.
 */
export type SettleOnceReceipt = {
  paid: boolean;
  payer: Address;
  invoiceKey: Hex;
  /** Zero address while unpaid. */
  recipient: Address;
  /** Base units (6 decimals), exactly as the contract stores them. */
  amount: bigint;
  /** The same amount as a plain decimal string, for printing. */
  amountUsdc: string;
  paidAtBlock: bigint;
  /** Block timestamp of the settlement, in unix seconds. 0n while unpaid. */
  paidAt: bigint;
};

export function toReceipt(payer: Address, invoiceKey: Hex, settlement: Settlement): SettleOnceReceipt {
  return {
    paid: settlement.paidAtBlock !== 0n,
    payer,
    invoiceKey,
    recipient: settlement.recipient,
    amount: settlement.amount,
    amountUsdc: formatUsdcAmount(settlement.amount),
    paidAtBlock: settlement.paidAtBlock,
    paidAt: settlement.paidAt,
  };
}

/** Read one settlement. A failing RPC throws: an unanswered question is never "unpaid". */
export async function getSettlement(
  publicClient: PublicClient,
  { contract, payer, key }: { contract: Address; payer: Address; key: Hex },
): Promise<SettleOnceReceipt> {
  const settlement = await publicClient.readContract({
    address: contract,
    abi: settleOnceAbi,
    functionName: "receiptFor",
    args: [payer, key],
  });
  return toReceipt(payer, key, {
    recipient: settlement.recipient,
    paidAtBlock: BigInt(settlement.paidAtBlock),
    amount: BigInt(settlement.amount),
    paidAt: BigInt(settlement.paidAt),
  });
}

/** Several settlements in one call, in the order the keys were given. */
export async function getSettlements(
  publicClient: PublicClient,
  { contract, payer, keys }: { contract: Address; payer: Address; keys: readonly Hex[] },
): Promise<SettleOnceReceipt[]> {
  if (keys.length === 0) return [];
  const out = await publicClient.readContract({
    address: contract,
    abi: settleOnceAbi,
    functionName: "receiptsFor",
    args: [payer, keys as Hex[]],
  });
  return out.map((settlement, i) =>
    toReceipt(payer, keys[i]!, {
      recipient: settlement.recipient,
      paidAtBlock: BigInt(settlement.paidAtBlock),
      amount: BigInt(settlement.amount),
      paidAt: BigInt(settlement.paidAt),
    }),
  );
}

/**
 * What to do with an invoice, decided from the chain alone.
 *
 *   unpaid key                        -> "pay"
 *   settled with these exact details  -> "already-paid"   (a rerun after a crash: do nothing)
 *   settled with different details    -> "conflict"       (someone changed the payment details)
 *
 * Pure, so the decision an agent acts on can be tested without a chain.
 */
export type PayAction = "pay" | "already-paid" | "conflict";

export function decidePayAction({
  receipt,
  recipient,
  amount,
}: {
  receipt: Pick<SettleOnceReceipt, "paid" | "recipient" | "amount">;
  recipient: Address;
  amount: bigint;
}): PayAction {
  if (!receipt.paid) return "pay";
  const sameRecipient = receipt.recipient.toLowerCase() === recipient.toLowerCase();
  return sameRecipient && receipt.amount === amount ? "already-paid" : "conflict";
}

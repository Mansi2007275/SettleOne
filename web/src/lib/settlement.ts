import type { Address } from "viem";
import type { Invoice } from "./invoice";

/** Mirrors SettleOnce.Settlement. paidAtBlock === 0n means unpaid. */
export type Settlement = {
  recipient: Address;
  paidAtBlock: bigint;
  amount: bigint;
  paidAt: bigint;
};

export type TicketStatus =
  | { kind: "checking" }
  | { kind: "unavailable"; reason: string }
  | { kind: "paid"; settlement: Settlement }
  | { kind: "conflict"; settlement: Settlement }
  | { kind: "approval" }
  | { kind: "ready" }
  | { kind: "connect" }
  | { kind: "wrong-network" };

export function isSettled(s: Settlement | undefined): s is Settlement {
  return !!s && s.paidAtBlock !== 0n;
}

/**
 * Status comes from the chain, never from local memory. An RPC failure is "unavailable",
 * never quietly turned into "unpaid".
 */
export function ticketStatus(args: {
  invoice: Invoice;
  connected: boolean;
  onRightNetwork: boolean;
  settlement: Settlement | undefined;
  settlementsLoading: boolean;
  settlementsError: string | null;
  allowance: bigint | undefined;
}): TicketStatus {
  const { invoice, connected, onRightNetwork, settlement, settlementsLoading, settlementsError, allowance } = args;
  if (!connected) return { kind: "connect" };
  if (!onRightNetwork) return { kind: "wrong-network" };
  if (settlementsError) return { kind: "unavailable", reason: settlementsError };
  if (settlementsLoading || settlement === undefined) return { kind: "checking" };
  if (isSettled(settlement)) {
    const same =
      settlement.recipient.toLowerCase() === invoice.recipient.toLowerCase() && settlement.amount === invoice.amount;
    return same ? { kind: "paid", settlement } : { kind: "conflict", settlement };
  }
  if (allowance === undefined) return { kind: "checking" };
  return allowance >= invoice.amount ? { kind: "ready" } : { kind: "approval" };
}

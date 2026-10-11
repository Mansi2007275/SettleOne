import type { Invoice } from "./invoice";
import type { TicketStatus } from "./settlement";
import { formatUsdc } from "./usdc";

/**
 * The desk tally.
 *
 * Totals are rolled up from the chain-derived ticket statuses only, so the strip can never claim
 * an invoice is paid before the contract says so. A ticket whose status is still being read, or
 * whose read failed, counts towards nothing: it is neither paid nor to pay until the chain answers.
 *
 * Amounts stay in 6-decimal base units (bigint) all the way through; nothing is summed as a float.
 */
export type DeskSummary = {
  paidCount: number;
  paidTotal: bigint;
  toPayCount: number;
  toPayTotal: bigint;
  conflictCount: number;
};

export type SummaryRow = { invoice: Invoice; status: TicketStatus };

export function summarizeDesk(rows: readonly SummaryRow[]): DeskSummary {
  let paidCount = 0;
  let paidTotal = 0n;
  let toPayCount = 0;
  let toPayTotal = 0n;
  let conflictCount = 0;

  for (const { invoice, status } of rows) {
    switch (status.kind) {
      case "paid":
        paidCount += 1;
        // The settled amount comes from the contract, not from the row on the desk.
        paidTotal += status.settlement.amount;
        break;
      case "conflict":
        // A conflict is neither paid nor payable: the file and the chain disagree, so it is
        // counted on its own and left out of both totals until the invoice is fixed.
        conflictCount += 1;
        break;
      case "ready":
      case "approval":
        toPayCount += 1;
        toPayTotal += invoice.amount;
        break;
      case "checking":
      case "unavailable":
      case "connect":
      case "wrong-network":
        break;
    }
  }

  return { paidCount, paidTotal, toPayCount, toPayTotal, conflictCount };
}

/** True once the chain has answered for at least one ticket, so there is something to show. */
export function hasSummary(s: DeskSummary): boolean {
  return s.paidCount > 0 || s.toPayCount > 0 || s.conflictCount > 0;
}

/** The same tally as one sentence, for the strip's live region. */
export function summaryLine(s: DeskSummary): string {
  const parts = [
    `Paid: ${s.paidCount}, ${formatUsdc(s.paidTotal)} USDC.`,
    `To pay: ${s.toPayCount}, ${formatUsdc(s.toPayTotal)} USDC.`,
  ];
  if (s.conflictCount > 0) parts.push(`Conflicts: ${s.conflictCount}.`);
  return parts.join(" ");
}

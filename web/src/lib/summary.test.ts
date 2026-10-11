import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { validateInvoice, type Invoice } from "./invoice";
import { ticketStatus, type Settlement, type TicketStatus } from "./settlement";
import { hasSummary, summarizeDesk, summaryLine, type SummaryRow } from "./summary";

const RECIPIENT = getAddress("0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF");
const OTHER = getAddress("0x5B38Da6a701c568545dCfcB03FcB875f56beddC4");

/** Built through the real validator, so a fixture can never be an invoice the app would reject. */
function invoice(invoiceRef: string, amount: string, recipient = RECIPIENT): Invoice {
  const result = validateInvoice({ vendorRef: "ACME", invoiceRef, recipient, amount });
  if (!result.ok) throw new Error(`fixture ${invoiceRef} is not a valid invoice`);
  return result.invoice;
}

function settlementFor(inv: Invoice, over: Partial<Settlement> = {}): Settlement {
  return { recipient: inv.recipient, amount: inv.amount, paidAtBlock: 4_210n, paidAt: 1_760_000_000n, ...over };
}

const row = (inv: Invoice, status: TicketStatus): SummaryRow => ({ invoice: inv, status });

describe("summarizeDesk", () => {
  it("is all zeros for an empty desk", () => {
    expect(summarizeDesk([])).toEqual({
      paidCount: 0,
      paidTotal: 0n,
      toPayCount: 0,
      toPayTotal: 0n,
      conflictCount: 0,
    });
  });

  it("counts and sums paid tickets", () => {
    const a = invoice("INV-1", "1.50");
    const b = invoice("INV-2", "0.75");
    const summary = summarizeDesk([
      row(a, { kind: "paid", settlement: settlementFor(a) }),
      row(b, { kind: "paid", settlement: settlementFor(b) }),
    ]);
    expect(summary.paidCount).toBe(2);
    expect(summary.paidTotal).toBe(2_250_000n);
  });

  it("takes the paid amount from the contract, not from the row on the desk", () => {
    const inv = invoice("INV-3", "9.00");
    const summary = summarizeDesk([row(inv, { kind: "paid", settlement: settlementFor(inv, { amount: 1_000_000n }) })]);
    expect(summary.paidTotal).toBe(1_000_000n);
  });

  it("puts both ready and needs-approval tickets in the to-pay total", () => {
    const summary = summarizeDesk([
      row(invoice("INV-4", "2.00"), { kind: "ready" }),
      row(invoice("INV-5", "0.25"), { kind: "approval" }),
    ]);
    expect(summary.toPayCount).toBe(2);
    expect(summary.toPayTotal).toBe(2_250_000n);
  });

  it("counts a conflict on its own and leaves it out of both totals", () => {
    const inv = invoice("INV-6", "5.00");
    const summary = summarizeDesk([
      row(inv, { kind: "conflict", settlement: settlementFor(inv, { recipient: OTHER }) }),
    ]);
    expect(summary).toEqual({
      paidCount: 0,
      paidTotal: 0n,
      toPayCount: 0,
      toPayTotal: 0n,
      conflictCount: 1,
    });
  });

  it("counts nothing while the chain has not answered, and nothing when the read failed", () => {
    const summary = summarizeDesk([
      row(invoice("INV-7", "1.00"), { kind: "checking" }),
      row(invoice("INV-8", "1.00"), { kind: "unavailable", reason: "rpc down" }),
      row(invoice("INV-9", "1.00"), { kind: "connect" }),
      row(invoice("INV-10", "1.00"), { kind: "wrong-network" }),
    ]);
    expect(hasSummary(summary)).toBe(false);
    expect(summary.toPayCount).toBe(0);
    expect(summary.toPayTotal).toBe(0n);
    expect(summary.paidTotal).toBe(0n);
  });

  it("mixes the three groups on one desk", () => {
    const paid = invoice("INV-11", "1.50");
    const clash = invoice("INV-12", "3.00");
    const summary = summarizeDesk([
      row(paid, { kind: "paid", settlement: settlementFor(paid) }),
      row(invoice("INV-13", "0.50"), { kind: "ready" }),
      row(invoice("INV-14", "0.50"), { kind: "approval" }),
      row(clash, { kind: "conflict", settlement: settlementFor(clash, { amount: 4_000_000n }) }),
      row(invoice("INV-15", "8.00"), { kind: "checking" }),
    ]);
    expect(summary).toEqual({
      paidCount: 1,
      paidTotal: 1_500_000n,
      toPayCount: 2,
      toPayTotal: 1_000_000n,
      conflictCount: 1,
    });
  });

  it("stays exact on amounts a float would round", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(invoice(`INV-BIG-${i}`, "999999999.999999"), { kind: "ready" }));
    expect(summarizeDesk(rows).toPayTotal).toBe(9_999_999_999_999_990n);
  });

  it("agrees with the status the desk actually computes", () => {
    const paid = invoice("INV-16", "1.00");
    const open = invoice("INV-17", "2.00");
    const statusOf = (inv: Invoice, settlement: Settlement | undefined, allowance: bigint) =>
      ticketStatus({
        invoice: inv,
        connected: true,
        onRightNetwork: true,
        settlement,
        settlementsLoading: false,
        settlementsError: null,
        allowance,
      });

    const summary = summarizeDesk([
      row(paid, statusOf(paid, settlementFor(paid), 0n)),
      row(open, statusOf(open, { recipient: OTHER, amount: 0n, paidAtBlock: 0n, paidAt: 0n }, 0n)),
    ]);

    expect(summary.paidCount).toBe(1);
    expect(summary.paidTotal).toBe(1_000_000n);
    // No allowance yet, so the open invoice is "needs approval" — still money to pay.
    expect(summary.toPayCount).toBe(1);
    expect(summary.toPayTotal).toBe(2_000_000n);
  });
});

describe("hasSummary", () => {
  it("is true as soon as one ticket has a chain-derived status", () => {
    const inv = invoice("INV-18", "1.00");
    expect(hasSummary(summarizeDesk([row(inv, { kind: "ready" })]))).toBe(true);
    expect(hasSummary(summarizeDesk([row(inv, { kind: "paid", settlement: settlementFor(inv) })]))).toBe(true);
    expect(hasSummary(summarizeDesk([row(inv, { kind: "conflict", settlement: settlementFor(inv) })]))).toBe(true);
  });

  it("is false for an empty desk", () => {
    expect(hasSummary(summarizeDesk([]))).toBe(false);
  });
});

describe("summaryLine", () => {
  it("reads the tally out in full", () => {
    const paid = invoice("INV-19", "1.50");
    const line = summaryLine(
      summarizeDesk([row(paid, { kind: "paid", settlement: settlementFor(paid) }), row(invoice("INV-20", "0.75"), { kind: "ready" })]),
    );
    expect(line).toBe("Paid: 1, 1.50 USDC. To pay: 1, 0.75 USDC.");
  });

  it("mentions conflicts only when there are some", () => {
    const clash = invoice("INV-21", "2.00");
    const withClash = summarizeDesk([row(clash, { kind: "conflict", settlement: settlementFor(clash, { amount: 1n }) })]);
    expect(summaryLine(withClash)).toBe("Paid: 0, 0.00 USDC. To pay: 0, 0.00 USDC. Conflicts: 1.");
    expect(summaryLine(summarizeDesk([]))).not.toContain("Conflicts");
  });

  it("groups thousands the way the tickets do", () => {
    expect(summaryLine(summarizeDesk([row(invoice("INV-22", "1250"), { kind: "ready" })]))).toContain("1,250.00 USDC");
  });
});

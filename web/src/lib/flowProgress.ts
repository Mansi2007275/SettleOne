import type { Hex } from "viem";

/**
 * The desk's six steps, and where the reader currently stands in them.
 *
 * Pure: every input is passed in, nothing is read from the browser, the chain or the clock.
 * The two facts that could be faked locally — "is it paid", "which receipt" — are derived by the
 * caller from the chain-backed ticket statuses, so this file can never claim a payment happened.
 *
 * Step 5 is a tip: recovery is something the chain does for you, not a chore on the desk, so it
 * never becomes the current step and never blocks the step after it.
 */
export type FlowStepId = "connect" | "add" | "save" | "pay" | "recover" | "receipt";

export type FlowInput = {
  /** Wallet connected *and* on the network this deployment lives on. */
  walletReady: boolean;
  invoiceCount: number;
  /** The desk differs from the last invoice file that was saved. */
  unsaved: boolean;
  /** Invoices the contract reports as paid. */
  paidCount: number;
  /** Key of the newest paid invoice on the desk, for the receipt link. */
  latestPaidKey: Hex | null;
};

export type FlowStepState = "done" | "current" | "upcoming";

export type FlowStep = {
  id: FlowStepId;
  /** 1-based, as printed in the punch. */
  number: number;
  title: string;
  help: string;
  state: FlowStepState;
  /** id of the desk section this step happens in, or null when the step only offers links. */
  target: string | null;
  /** A tip is never the current step. */
  tip: boolean;
};

export type FlowProgress = {
  steps: FlowStep[];
  doneCount: number;
  /** The step to work on now. When everything is done it is the last step. */
  current: FlowStep;
  complete: boolean;
  /** "Step 3 of 6 · Save your invoice file" — the collapsed bar and the live region. */
  line: string;
};

type StepDef = Omit<FlowStep, "number" | "state"> & { done: (input: FlowInput) => boolean };

const DEFS: readonly StepDef[] = [
  {
    id: "connect",
    title: "Connect wallet",
    help: "Connect the wallet you pay from, on the network this contract is deployed to.",
    target: "desk-wallet",
    tip: false,
    done: (i) => i.walletReady,
  },
  {
    id: "add",
    title: "Add an invoice",
    help: "Scan a photo of it, write it by hand, or load the CSV invoice file you keep.",
    target: "desk-add",
    tip: false,
    done: (i) => i.invoiceCount > 0,
  },
  {
    id: "save",
    title: "Save your invoice file",
    help: "Download the CSV. It is the only copy of this desk outside this browser.",
    target: "desk-file",
    tip: false,
    done: (i) => i.invoiceCount > 0 && !i.unsaved,
  },
  {
    id: "pay",
    title: "Pay once",
    help: "One signature per invoice. The contract records the key and turns away a second payment.",
    target: "desk-tickets",
    tip: false,
    done: (i) => i.paidCount > 0,
  },
  {
    id: "recover",
    title: "Recover after a crash",
    help: "Lost the tab? Load your file again — the chain shows which invoices are already paid.",
    target: "desk-file",
    tip: true,
    // Only once a payment is on the chain is there anything to recover; until then it stays a tip.
    done: (i) => i.paidCount > 0,
  },
  {
    id: "receipt",
    title: "See receipt and ledger",
    help: "Open the receipt for a paid invoice, or the ledger of every settlement this contract made.",
    target: null,
    tip: false,
    done: (i) => i.paidCount > 0 && i.latestPaidKey !== null,
  },
];

export const FLOW_STEP_COUNT = DEFS.length;

export function flowProgress(input: FlowInput): FlowProgress {
  const done = DEFS.map((def) => def.done(input));

  // The first unfinished step that actually needs doing. A step can be done while an earlier one
  // is not (invoices on the desk with no wallet connected), so each state is read on its own.
  const firstOpen = DEFS.findIndex((def, i) => !def.tip && !done[i]);
  const currentIndex = firstOpen >= 0 ? firstOpen : DEFS.length - 1;

  const steps: FlowStep[] = DEFS.map(({ done: _done, ...def }, i) => ({
    ...def,
    number: i + 1,
    state: done[i] ? "done" : i === currentIndex ? "current" : "upcoming",
  }));

  const current = steps[currentIndex]!;
  return {
    steps,
    doneCount: done.filter(Boolean).length,
    current,
    complete: done.every(Boolean),
    line: `Step ${current.number} of ${steps.length} · ${current.title}`,
  };
}

/**
 * The newest paid invoice, for step 6's receipt link. Rows come from the contract's settlements,
 * so "newest" is the highest settlement block; an earlier row wins a tie, which only happens when
 * two invoices settled in the same block.
 */
export function pickLatestPaidKey(paid: readonly { key: Hex; paidAtBlock: bigint }[]): Hex | null {
  let best: { key: Hex; paidAtBlock: bigint } | null = null;
  for (const row of paid) {
    if (!best || row.paidAtBlock > best.paidAtBlock) best = row;
  }
  return best?.key ?? null;
}

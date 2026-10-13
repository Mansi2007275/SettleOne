import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { FLOW_STEP_COUNT, flowProgress, pickLatestPaidKey, type FlowInput, type FlowStepId } from "./flowProgress";

const KEY_A = "0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b" as Hex;
const KEY_B = "0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff" as Hex;

/** Nothing has happened yet: no wallet, empty desk, nothing saved, nothing paid. */
const FRESH: FlowInput = { walletReady: false, invoiceCount: 0, unsaved: false, paidCount: 0, latestPaidKey: null };

function states(input: FlowInput): Record<FlowStepId, string> {
  const entries = flowProgress(input).steps.map((s) => [s.id, s.state] as const);
  return Object.fromEntries(entries) as Record<FlowStepId, string>;
}

describe("flowProgress", () => {
  it("always returns the six steps in order, numbered from one", () => {
    const { steps } = flowProgress(FRESH);
    expect(steps).toHaveLength(FLOW_STEP_COUNT);
    expect(steps.map((s) => s.id)).toEqual(["connect", "add", "save", "pay", "recover", "receipt"]);
    expect(steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps.every((s) => s.title.length > 0 && s.help.length > 0)).toBe(true);
  });

  it("starts on step 1 with nothing done", () => {
    const progress = flowProgress(FRESH);
    expect(progress.doneCount).toBe(0);
    expect(progress.complete).toBe(false);
    expect(progress.current.id).toBe("connect");
    expect(progress.line).toBe("Step 1 of 6 · Connect wallet");
    expect(states(FRESH).connect).toBe("current");
    expect(states(FRESH).add).toBe("upcoming");
  });

  it("moves to adding an invoice once the wallet is ready on the right network", () => {
    const progress = flowProgress({ ...FRESH, walletReady: true });
    expect(progress.current.id).toBe("add");
    expect(progress.doneCount).toBe(1);
    expect(progress.line).toBe("Step 2 of 6 · Add an invoice");
  });

  it("counts an invoice on the desk, and asks for the file next", () => {
    const input: FlowInput = { ...FRESH, walletReady: true, invoiceCount: 2, unsaved: true };
    const progress = flowProgress(input);
    expect(states(input)).toMatchObject({ connect: "done", add: "done", save: "current" });
    expect(progress.current.id).toBe("save");
  });

  it("marks the file saved only when the desk has invoices and no unsaved changes", () => {
    const saved = { ...FRESH, walletReady: true, invoiceCount: 1, unsaved: false };
    expect(states(saved).save).toBe("done");
    expect(states({ ...saved, unsaved: true }).save).toBe("current");
    // An empty desk has nothing to save, so the step is not quietly ticked off.
    expect(states({ ...FRESH, walletReady: true, unsaved: false }).save).toBe("upcoming");
  });

  it("only ticks 'pay once' off the chain-derived paid count", () => {
    const ready = { ...FRESH, walletReady: true, invoiceCount: 1, unsaved: false };
    expect(states(ready).pay).toBe("current");
    expect(states({ ...ready, paidCount: 1, latestPaidKey: KEY_A }).pay).toBe("done");
  });

  it("never makes the recovery tip the current step", () => {
    const inputs: FlowInput[] = [
      FRESH,
      { ...FRESH, walletReady: true },
      { ...FRESH, walletReady: true, invoiceCount: 1, unsaved: true },
      { ...FRESH, walletReady: true, invoiceCount: 1, unsaved: false },
      { ...FRESH, walletReady: true, invoiceCount: 1, unsaved: false, paidCount: 1, latestPaidKey: KEY_A },
    ];
    for (const input of inputs) {
      const progress = flowProgress(input);
      expect(progress.current.id).not.toBe("recover");
      expect(progress.steps[4]!.tip).toBe(true);
    }
  });

  it("does not let the tip block the receipt step", () => {
    // Paid, so the tip is done too; the current step jumps from 4 straight to 6.
    const progress = flowProgress({ ...FRESH, walletReady: true, invoiceCount: 1, paidCount: 1, latestPaidKey: KEY_A });
    expect(progress.complete).toBe(true);
    expect(progress.current.id).toBe("receipt");
    expect(progress.line).toBe("Step 6 of 6 · See receipt and ledger");
  });

  it("holds the receipt step open until there is a key to link to", () => {
    const progress = flowProgress({ ...FRESH, walletReady: true, invoiceCount: 1, paidCount: 1, latestPaidKey: null });
    expect(states({ ...FRESH, walletReady: true, invoiceCount: 1, paidCount: 1, latestPaidKey: null }).receipt).toBe(
      "current",
    );
    expect(progress.complete).toBe(false);
  });

  it("shows a later step done while an earlier one is still open", () => {
    // Invoices loaded from a file, wallet not connected yet: step 2 is done, step 1 is current.
    const s = states({ ...FRESH, invoiceCount: 3, unsaved: false });
    expect(s.connect).toBe("current");
    expect(s.add).toBe("done");
    expect(s.save).toBe("done");
    expect(s.pay).toBe("upcoming");
  });

  it("gives every step a desk target except the receipt step", () => {
    const { steps } = flowProgress(FRESH);
    expect(steps.filter((s) => s.target === null).map((s) => s.id)).toEqual(["receipt"]);
    expect(steps.find((s) => s.id === "pay")!.target).toBe("desk-tickets");
  });

  it("is pure: the same input gives the same answer and nothing is mutated", () => {
    const input: FlowInput = { ...FRESH, walletReady: true, invoiceCount: 1 };
    const before = JSON.stringify(input);
    expect(flowProgress(input)).toEqual(flowProgress(input));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("pickLatestPaidKey", () => {
  it("is null with nothing paid", () => {
    expect(pickLatestPaidKey([])).toBeNull();
  });

  it("picks the highest settlement block, whatever the row order", () => {
    expect(pickLatestPaidKey([{ key: KEY_A, paidAtBlock: 10n }, { key: KEY_B, paidAtBlock: 99n }])).toBe(KEY_B);
    expect(pickLatestPaidKey([{ key: KEY_B, paidAtBlock: 99n }, { key: KEY_A, paidAtBlock: 10n }])).toBe(KEY_B);
  });

  it("compares as bigint, not as text", () => {
    // "9" sorts after "10" as a string; as numbers 10 wins.
    expect(pickLatestPaidKey([{ key: KEY_A, paidAtBlock: 9n }, { key: KEY_B, paidAtBlock: 10n }])).toBe(KEY_B);
  });

  it("keeps the earlier row when two invoices settled in the same block", () => {
    expect(pickLatestPaidKey([{ key: KEY_A, paidAtBlock: 7n }, { key: KEY_B, paidAtBlock: 7n }])).toBe(KEY_A);
  });
});

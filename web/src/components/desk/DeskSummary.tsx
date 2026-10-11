"use client";

import { summaryLine, type DeskSummary } from "@/lib/summary";
import { formatUsdc } from "@/lib/usdc";
import styles from "./DeskSummary.module.css";

/**
 * The desk tally, straight off the chain-derived ticket statuses. Shown only with a wallet
 * connected on the right network, because that is the only time the contract has been asked.
 *
 * The chips are decoration for a screen reader: the same numbers go out once, as one sentence,
 * through a polite live region, so a chain read landing doesn't read the whole strip back out.
 */
export function DeskSummaryStrip({ summary }: { summary: DeskSummary }) {
  return (
    <div className={styles.strip} role="group" aria-label="Desk totals read from the chain">
      <ul className={styles.chips} aria-hidden="true">
        <Stub tone="paid" label="Paid" count={summary.paidCount} total={summary.paidTotal} />
        <Stub tone="open" label="To pay" count={summary.toPayCount} total={summary.toPayTotal} />
        {summary.conflictCount > 0 ? <Stub tone="danger" label="Conflicts" count={summary.conflictCount} /> : null}
      </ul>
      <p className="visually-hidden" aria-live="polite">
        {summaryLine(summary)}
      </p>
    </div>
  );
}

function Stub({
  tone,
  label,
  count,
  total,
}: {
  tone: string;
  label: string;
  count: number;
  total?: bigint;
}) {
  return (
    <li className={styles.chip} data-tone={tone}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className={styles.count}>{count}</span>
        {total === undefined ? null : (
          <>
            <span className={styles.sep}>·</span>
            <span className="mono">{formatUsdc(total)}</span>
            <span className={styles.unit}>USDC</span>
          </>
        )}
      </span>
    </li>
  );
}

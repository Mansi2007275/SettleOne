"use client";

import Link from "next/link";
import type { FlowProgress, FlowStep } from "@/lib/flowProgress";
import styles from "./FlowStepper.module.css";

/**
 * "Your progress": the six steps of the desk, with each one's state worked out from the wallet,
 * the desk and the chain. Presentational — the caller does the deriving in flowProgress.
 *
 * It is never hidden for good. "Hide" collapses it to a one-line bar that still says which step
 * you are on, so the loop can always be found again.
 */
export function FlowStepper({
  progress,
  collapsed,
  onCollapsedChange,
  receiptHref,
}: {
  progress: FlowProgress;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Receipt of the newest paid invoice, or null until the chain reports one. */
  receiptHref: string | null;
}) {
  const announce = `${progress.line}. ${progress.doneCount} of ${progress.steps.length} steps done.`;

  if (collapsed) {
    return (
      <section className={styles.bar} aria-label="Your progress">
        <p className={styles.barLine}>
          <span className={styles.barStep}>
            Step {progress.current.number} of {progress.steps.length}
          </span>
          <span className={styles.barSep} aria-hidden="true">
            ·
          </span>
          <span className={styles.barTitle}>{progress.current.title}</span>
        </p>
        <button type="button" className="btn btn-small" onClick={() => onCollapsedChange(false)}>
          Show steps
        </button>
        <p className="visually-hidden" aria-live="polite">
          {announce}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.flow} aria-labelledby="your-progress-title">
      <div className={styles.head}>
        <h2 id="your-progress-title">Your progress</h2>
        <p className={styles.tally}>
          {progress.doneCount} of {progress.steps.length} done
        </p>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => onCollapsedChange(true)}>
          Hide
          <span className="visually-hidden"> the steps, keeping a one-line bar</span>
        </button>
      </div>

      <ol className={styles.steps}>
        {progress.steps.map((step) => (
          <Step key={step.id} step={step} receiptHref={receiptHref} />
        ))}
      </ol>

      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}

const FLAG: Record<FlowStep["state"], string> = { done: "Done", current: "Do this now", upcoming: "Next" };

function Step({ step, receiptHref }: { step: FlowStep; receiptHref: string | null }) {
  return (
    <li className={styles.step} data-state={step.state}>
      <span className={styles.punch} aria-hidden="true">
        {step.state === "done" ? "✓" : step.number}
      </span>

      <div className={styles.body}>
        <h3 className={styles.title}>
          <span className="visually-hidden">Step {step.number}: </span>
          {step.target ? <a href={`#${step.target}`}>{step.title}</a> : step.title}
        </h3>
        <p className={styles.help}>{step.help}</p>

        {step.id === "receipt" ? (
          <p className={styles.links}>
            {receiptHref ? (
              <Link href={receiptHref}>Latest receipt</Link>
            ) : (
              <span className={styles.pending}>The latest receipt appears here once an invoice is paid.</span>
            )}
            <span className={styles.barSep} aria-hidden="true">
              ·
            </span>
            <Link href="/ledger">Ledger</Link>
          </p>
        ) : null}
      </div>

      <span className={styles.flag}>
        {step.tip ? "Tip" : FLAG[step.state]}
        {step.state === "done" ? <span aria-hidden="true"> ✓</span> : null}
      </span>
    </li>
  );
}

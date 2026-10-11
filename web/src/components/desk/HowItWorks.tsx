"use client";

import styles from "./HowItWorks.module.css";

const STEPS = [
  "Write, load or scan an invoice",
  "Pay once from your wallet",
  "Lost the tab? Load your file, the chain shows what's paid.",
] as const;

/**
 * The three steps, for someone who has just arrived at the desk.
 *
 * Presentational only. The caller decides whether to show it: it is hidden once the reader
 * presses "Got it", and once the desk holds a paid invoice, because by then the loop has been
 * demonstrated on the chain itself.
 */
export function HowItWorks({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className={styles.strip} aria-labelledby="how-it-works-title">
      <div className={styles.head}>
        <h2 id="how-it-works-title">How it works</h2>
        <button type="button" className="btn btn-small btn-ghost" onClick={onDismiss}>
          Got it
          <span className="visually-hidden">, hide how it works</span>
        </button>
      </div>

      <ol className={styles.cards}>
        {STEPS.map((text, i) => (
          <li key={text} className={styles.card}>
            <div className={styles.body}>
              <p className={styles.step}>Step {i + 1}</p>
              <p className={styles.text}>{text}</p>
            </div>
            <div className={styles.stub} aria-hidden="true">
              <span className={styles.punch}>{i + 1}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

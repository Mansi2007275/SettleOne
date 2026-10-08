"use client";

import { useId } from "react";
import styles from "./Bench.module.css";

/**
 * Fault injection for the demo, clearly labelled. When on, the app throws away its local desk and reloads
 * the page the moment the wallet returns a transaction hash, before any success message.
 */
export function CrashTest({
  on,
  canArm,
  onChange,
}: {
  on: boolean;
  canArm: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <section className={`hazard ${styles.crash}`} aria-labelledby={`${id}-title`}>
      <div className="hazard-body">
        <h2 id={`${id}-title`}>Crash test</h2>
        <p className="panel-note">
          A simulated crash for demos. With this on, once your wallet sends a payment the app wipes this desk and
          reloads before showing any result. Then load your saved file and watch the chain report what was paid.
        </p>
        <label className={styles.toggle} htmlFor={`${id}-toggle`}>
          <input
            id={`${id}-toggle`}
            type="checkbox"
            role="switch"
            checked={on}
            disabled={!on && !canArm}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className={styles.toggleTrack} aria-hidden="true">
            <span className={styles.toggleThumb} />
          </span>
          <span>{on ? "Armed: next payment crashes the app" : "Crash right after sending"}</span>
        </label>
        {!on && !canArm ? <p className="field-hint">Save your invoice file first, so you can bring the desk back.</p> : null}
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { chain } from "@/config/env";
import type { Invoice } from "@/lib/invoice";
import { PAY_CONFIRM_WARNING, payConfirmDetails } from "@/lib/payConfirm";
import styles from "./PayConfirmDialog.module.css";

/**
 * The last look before real USDC moves. Shown for every payment on Arc mainnet — the single
 * `payOnce` and the batched approve-and-pay alike, because both come through the desk's one pay
 * entry point.
 *
 * It prints the whole recipient address in groups of four, never shortened: a shortened address
 * is exactly what someone who swapped its middle is relying on. Nothing here is remembered, so
 * there is no "don't ask again".
 *
 * A native `<dialog>` opened with `showModal()`, so the rest of the page is inert and the
 * backdrop is the browser's. Esc closes it (cancel = don't pay). Tab is trapped inside, in both
 * directions, because a modal that leaks focus to the page behind it is not modal.
 */
export function PayConfirmDialog({
  invoice,
  onConfirm,
  onCancel,
}: {
  invoice: Invoice;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const details = payConfirmDetails(invoice);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Cancel holds the focus: the dangerous button is never one stray Enter away.
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const trapTab = useCallback((event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-warning`}
      onKeyDown={trapTab}
      onCancel={(event) => {
        // Esc. Handled here so closing always means "don't pay", never a silent dismissal.
        event.preventDefault();
        onCancel();
      }}
    >
      <div className={styles.body}>
        <p className={styles.eyebrow}>{chain.name} · real USDC</p>
        <h2 id={`${id}-title`} className={styles.title}>
          Pay {details.amountText} USDC?
        </h2>

        <p className={styles.amount}>
          <span className="mono">{details.amountText}</span> <span className={styles.unit}>USDC</span>
        </p>

        <div className={styles.block}>
          <p className={styles.label} id={`${id}-to`}>
            To this wallet, in full
          </p>
          <p className={styles.address} aria-describedby={`${id}-to`}>
            {/* Read out as one address, shown in fours so it can be checked against the paper. */}
            <span className="visually-hidden">{details.recipient}</span>
            <span aria-hidden="true">
              {details.recipientGroups.map((group, i) => (
                <span key={i} className={styles.group}>
                  {group}
                </span>
              ))}
            </span>
          </p>
          <p className={styles.check}>Compare every group with the invoice in front of you.</p>
        </div>

        <dl className={styles.refs}>
          <div>
            <dt>Vendor reference</dt>
            <dd className="mono">{details.vendorRef}</dd>
          </div>
          <div>
            <dt>Invoice reference</dt>
            <dd className="mono">{details.invoiceRef}</dd>
          </div>
        </dl>

        <p id={`${id}-warning`} className={styles.warning}>
          {PAY_CONFIRM_WARNING}
        </p>

        <div className={styles.actions}>
          <button type="button" className="btn btn-signal" onClick={onConfirm}>
            {details.payLabel}
          </button>
          <button type="button" ref={cancelRef} className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}

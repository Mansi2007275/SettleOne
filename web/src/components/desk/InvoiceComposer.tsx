"use client";

import { useId, useMemo, useState } from "react";
import { settleOnceAddress } from "@/config/env";
import { shortHex } from "@/lib/explorer";
import {
  deriveInvoiceKey,
  normalizeRef,
  sameDetails,
  validateInvoice,
  type FieldErrors,
  type Invoice,
  type InvoiceInput,
} from "@/lib/invoice";
import styles from "./Bench.module.css";

const EMPTY: InvoiceInput = { vendorRef: "", invoiceRef: "", recipient: "", amount: "" };

export function InvoiceComposer({
  desk,
  full,
  onAdd,
}: {
  desk: Invoice[];
  full: boolean;
  onAdd: (invoice: Invoice) => void;
}) {
  const id = useId();
  const [form, setForm] = useState<InvoiceInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const previewKey = useMemo(() => {
    if (!normalizeRef(form.vendorRef) || !normalizeRef(form.invoiceRef)) return null;
    return deriveInvoiceKey(form.vendorRef, form.invoiceRef);
  }, [form.vendorRef, form.invoiceRef]);

  const set = (field: keyof InvoiceInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
    setNotice(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateInvoice(form, settleOnceAddress ? [settleOnceAddress] : []);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const existing = desk.find((i) => i.key === result.invoice.key);
    if (existing) {
      setNotice(
        sameDetails(existing, result.invoice)
          ? "That invoice is already on the desk."
          : "An invoice with these references is already on the desk with a different recipient or amount. Same references mean the same invoice.",
      );
      return;
    }
    onAdd(result.invoice);
    setForm((f) => ({ ...EMPTY, vendorRef: f.vendorRef }));
    setErrors({});
    setNotice(null);
  };

  const field = (name: keyof InvoiceInput, label: string, placeholder: string, opts: { mono?: boolean; hint?: string; inputMode?: "decimal" } = {}) => (
    <div className="field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      <input
        id={`${id}-${name}`}
        name={name}
        value={form[name]}
        onChange={set(name)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        inputMode={opts.inputMode}
        className={opts.mono ? "mono-input" : undefined}
        aria-invalid={errors[name] ? "true" : undefined}
        aria-describedby={errors[name] ? `${id}-${name}-err` : opts.hint ? `${id}-${name}-hint` : undefined}
      />
      {errors[name] ? (
        <span id={`${id}-${name}-err`} className="field-error">
          {errors[name]}
        </span>
      ) : opts.hint ? (
        <span id={`${id}-${name}-hint`} className="field-hint">
          {opts.hint}
        </span>
      ) : null}
    </div>
  );

  return (
    <form className={`panel ${styles.composer}`} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Write an invoice</h2>
      <div className={styles.pair}>
        {field("vendorRef", "Vendor reference", "VENDOR-7", { hint: "Who issued it. Stays the same on every invoice from them." })}
        {field("invoiceRef", "Invoice number", "INV-1042", { hint: "Exactly as printed on the invoice." })}
      </div>
      {field("recipient", "Pay to wallet", "0x…", { mono: true })}
      {field("amount", "Amount (USDC)", "0.10", { mono: true, inputMode: "decimal" })}

      <p className={styles.keyPreview} aria-live="polite">
        {previewKey ? (
          <>
            Invoice key <span className="mono" title={previewKey}>{shortHex(previewKey, 10, 8)}</span>
          </>
        ) : (
          "The invoice key comes from the vendor reference and invoice number only."
        )}
      </p>

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      <button type="submit" className="btn btn-signal" disabled={full}>
        {full ? "Desk is full (20 invoices)" : "Add to desk"}
      </button>
    </form>
  );
}

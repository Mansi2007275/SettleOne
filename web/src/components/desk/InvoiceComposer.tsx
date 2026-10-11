"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { settleOnceAddress } from "@/config/env";
import type { DemoFill } from "@/lib/demoInvoice";
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
import { scanMarks, type ScanMark, type ScanPrefill } from "@/lib/invoiceScan";
import { DemoInvoiceButton } from "./DemoInvoiceButton";
import styles from "./Bench.module.css";

const EMPTY: InvoiceInput = { vendorRef: "", invoiceRef: "", recipient: "", amount: "" };

type Marks = Partial<Record<keyof InvoiceInput, ScanMark>>;

export function InvoiceComposer({
  desk,
  full,
  prefill,
  demoFill,
  connected,
  onAdd,
  onDemoFill,
}: {
  desk: Invoice[];
  full: boolean;
  prefill?: ScanPrefill | null;
  demoFill?: DemoFill | null;
  connected: boolean;
  onAdd: (invoice: Invoice) => void;
  onDemoFill: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState<InvoiceInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  // Which fields the scanner filled in, and how sure it was. Cleared as soon as the user types.
  const [marks, setMarks] = useState<Marks>({});
  const recipientRef = useRef<HTMLInputElement>(null);

  // A scan only ever pre-fills this form. It never derives a key, adds an invoice or pays.
  useEffect(() => {
    if (!prefill) return;
    const { result } = prefill;
    setForm({
      vendorRef: result.vendorRef ?? "",
      invoiceRef: result.invoiceRef ?? "",
      recipient: result.recipient ?? "",
      amount: result.amount ?? "",
    });
    setMarks(scanMarks(result));
    setErrors({});
    setNotice(null);
  }, [prefill]);

  // The demo button fills the same form, with no scan marks: nothing here came off an image.
  useEffect(() => {
    if (!demoFill) return;
    setForm(demoFill.input);
    setMarks({});
    setErrors({});
    if (demoFill.input.recipient) {
      setNotice("Demo invoice filled in. Review it, then press Add to desk.");
    } else {
      setNotice("Demo invoice filled in. Add the wallet to pay, then press Add to desk.");
      recipientRef.current?.focus();
    }
  }, [demoFill]);

  const previewKey = useMemo(() => {
    if (!normalizeRef(form.vendorRef) || !normalizeRef(form.invoiceRef)) return null;
    return deriveInvoiceKey(form.vendorRef, form.invoiceRef);
  }, [form.vendorRef, form.invoiceRef]);

  const set = (field: keyof InvoiceInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
    setMarks((m) => ({ ...m, [field]: undefined }));
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
    setMarks({});
    setNotice(null);
  };

  const field = (
    name: keyof InvoiceInput,
    label: string,
    placeholder: string,
    opts: {
      mono?: boolean;
      hint?: string;
      inputMode?: "decimal";
      inputRef?: React.RefObject<HTMLInputElement | null>;
    } = {},
  ) => {
    const mark = marks[name];
    const fromImage = mark !== undefined && mark !== "missing";
    const check = mark !== undefined && mark !== "high";
    const describedBy = errors[name]
      ? `${id}-${name}-err`
      : check
        ? `${id}-${name}-check`
        : opts.hint
          ? `${id}-${name}-hint`
          : undefined;

    return (
      <div className="field" data-check={check && !errors[name] ? "yes" : undefined}>
        <label htmlFor={`${id}-${name}`}>
          {label}
          {fromImage ? <span className={styles.fromImage}>from image</span> : null}
        </label>
        <input
          ref={opts.inputRef}
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
          aria-describedby={describedBy}
        />
        {errors[name] ? (
          <span id={`${id}-${name}-err`} className="field-error">
            {errors[name]}
          </span>
        ) : check ? (
          <span id={`${id}-${name}-check`} className={styles.checkThis}>
            Check this
          </span>
        ) : opts.hint ? (
          <span id={`${id}-${name}-hint`} className="field-hint">
            {opts.hint}
          </span>
        ) : null}
      </div>
    );
  };

  const recipientFromImage = marks.recipient !== undefined && marks.recipient !== "missing";

  return (
    <form className={`panel ${styles.composer}`} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Write an invoice</h2>
      <DemoInvoiceButton connected={connected} onFill={onDemoFill} />
      <div className={styles.pair}>
        {field("vendorRef", "Vendor reference", "VENDOR-7", {
          hint: "Who issued it. Stays the same on every invoice from them.",
        })}
        {field("invoiceRef", "Invoice number", "INV-1042", { hint: "Exactly as printed on the invoice." })}
      </div>
      {field("recipient", "Pay to wallet", "0x…", { mono: true, inputRef: recipientRef })}
      {recipientFromImage ? (
        <p className={styles.compare}>Compare this address with the invoice character by character.</p>
      ) : null}
      {field("amount", "Amount (USDC)", "0.10", { mono: true, inputMode: "decimal" })}

      <p className={styles.keyPreview} aria-live="polite">
        {previewKey ? (
          <>
            Invoice key{" "}
            <span className="mono" title={previewKey}>
              {shortHex(previewKey, 10, 8)}
            </span>
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

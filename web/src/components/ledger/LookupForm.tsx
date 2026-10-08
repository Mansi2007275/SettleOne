"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { getAddress, isAddress, isHex } from "viem";
import { deriveInvoiceKey, normalizeRef } from "@/lib/invoice";
import styles from "./Ledger.module.css";

/** Find one settlement without a wallet: payer address plus the invoice references (or a raw key). */
export function LookupForm() {
  const id = useId();
  const router = useRouter();
  const [payer, setPayer] = useState("");
  const [vendorRef, setVendorRef] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [rawKey, setRawKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isAddress(payer.trim(), { strict: false })) {
      setError("Enter the payer's wallet address.");
      return;
    }
    const p = getAddress(payer.trim());
    const key = rawKey.trim();
    if (key) {
      if (!isHex(key) || key.length !== 66) {
        setError("An invoice key is 0x followed by 64 hex characters.");
        return;
      }
      router.push(`/receipt/${p}/${key.toLowerCase()}`);
      return;
    }
    if (!normalizeRef(vendorRef) || !normalizeRef(invoiceRef)) {
      setError("Enter the vendor reference and invoice number, or paste an invoice key.");
      return;
    }
    const k = deriveInvoiceKey(vendorRef, invoiceRef);
    router.push(`/receipt/${p}/${k}?v=${encodeURIComponent(normalizeRef(vendorRef))}&i=${encodeURIComponent(normalizeRef(invoiceRef))}`);
  };

  return (
    <form className={`panel ${styles.lookup}`} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Check an invoice</h2>
      <p className="panel-note">Anyone can verify a settlement. Nothing to connect, nothing to sign.</p>
      <div className="field">
        <label htmlFor={`${id}-payer`}>Payer wallet</label>
        <input id={`${id}-payer`} className="mono-input" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
      </div>
      <div className={styles.pair}>
        <div className="field">
          <label htmlFor={`${id}-v`}>Vendor reference</label>
          <input id={`${id}-v`} value={vendorRef} onChange={(e) => setVendorRef(e.target.value)} placeholder="VENDOR-7" spellCheck={false} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-i`}>Invoice number</label>
          <input id={`${id}-i`} value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="INV-1042" spellCheck={false} autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-k`}>Or an invoice key</label>
        <input id={`${id}-k`} className="mono-input" value={rawKey} onChange={(e) => setRawKey(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn-signal" type="submit">
        Open receipt
      </button>
    </form>
  );
}

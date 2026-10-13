"use client";

import { useId, useRef, useState } from "react";
import { settleOnceAddress } from "@/config/env";
import { canHandOffToScanner, checkDeskFile } from "@/lib/deskFile";
import { CSV_HEADER, importInvoicesCsv, invoicesToCsv, type CsvImport, type Invoice } from "@/lib/invoice";
import styles from "./Bench.module.css";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** An invoice image or PDF that landed here by mistake, waiting to be sent to the scanner. */
type Misplaced = { file: File; kind: "image" | "pdf"; message: string };

export function InvoiceFileBench({
  desk,
  savedCsv,
  onLoad,
  onSaved,
  onClear,
  onScanInstead,
}: {
  desk: Invoice[];
  savedCsv: string | null;
  onLoad: (invoices: Invoice[]) => void;
  onSaved: (csv: string) => void;
  onClear: () => void;
  /** Open the invoice scanner with this exact file, so it is picked only once. */
  onScanInstead: (file: File) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<(CsvImport & { fileName: string }) | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [misplaced, setMisplaced] = useState<Misplaced | null>(null);
  const [dragging, setDragging] = useState(false);

  const currentCsv = invoicesToCsv(desk);
  const saved = desk.length > 0 && savedCsv === currentCsv;

  const onFile = async (file: File | undefined) => {
    setReadError(null);
    setReport(null);
    setMisplaced(null);
    if (!file) return;

    // What kind of file this is settles first: a photo of an invoice is not an oversized CSV,
    // and saying so is the difference between a dead end and the scanner above.
    const check = checkDeskFile(file);
    if (!check.ok) {
      if (check.reason === "scan") setMisplaced({ file, kind: check.kind, message: check.message });
      else setReadError(check.message);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      const text = await file.text();
      const result = importInvoicesCsv(text, settleOnceAddress ? [settleOnceAddress] : []);
      setReport({ ...result, fileName: file.name });
      if (result.invoices.length > 0) onLoad(result.invoices);
    } catch {
      setReadError("Couldn't read that file.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className={`panel ${styles.file}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Invoice file</h2>
      <p className="panel-note">
        Save the desk as a CSV. If the app crashes or you switch devices, load the same file: the chain fills in
        what&apos;s already paid.
      </p>

      <div
        className={styles.fileDrop}
        data-drag={dragging ? "yes" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void onFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div className={styles.fileActions}>
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <label htmlFor={`${id}-input`} className="btn btn-small" tabIndex={0} onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}>
            Load file
          </label>
          <button
            className="btn btn-small"
            disabled={desk.length === 0}
            onClick={() => {
              download(`settleonce-invoices-${new Date().toISOString().slice(0, 10)}.csv`, currentCsv);
              onSaved(currentCsv);
            }}
          >
            Save file
          </button>
          <button
            className="btn btn-ghost btn-small"
            disabled={desk.length === 0}
            onClick={() => {
              if (window.confirm("Clear the desk in this browser? Payments on chain are not affected.")) onClear();
            }}
          >
            Clear desk
          </button>
        </div>
        <p className={styles.fileDropHint}>Or drop your saved CSV here.</p>
      </div>

      <p className={styles.saveState} data-saved={saved ? "yes" : "no"}>
        {desk.length === 0
          ? "Nothing on the desk yet."
          : saved
            ? "Your saved file matches the desk."
            : "The desk has changes you haven't saved to a file."}
      </p>

      <p className="field-hint">
        Columns: <span className="mono">{CSV_HEADER.join(",")}</span>.{" "}
        <button className="link-button" onClick={() => download("settleonce-invoices-template.csv", CSV_HEADER.join(",") + "\n")}>
          Get a blank file
        </button>
      </p>

      {misplaced ? (
        <div className={styles.misplaced} role="status">
          <p className={styles.misplacedText}>{misplaced.message}</p>
          <p className={styles.misplacedFile}>
            <span className="mono">{misplaced.file.name}</span>
          </p>
          <div className={styles.misplacedActions}>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                const { file } = misplaced;
                setMisplaced(null);
                onScanInstead(file);
              }}
            >
              Scan this file
            </button>
            <button type="button" className="link-button" onClick={() => setMisplaced(null)}>
              Dismiss
            </button>
          </div>
          {canHandOffToScanner(misplaced.kind) ? null : (
            <p className="field-hint">
              The reader works on images, so a PDF needs a photo or a screenshot of the page first.
            </p>
          )}
        </div>
      ) : null}

      {readError ? (
        <p className="field-error" role="alert">
          {readError}
        </p>
      ) : null}

      {report ? (
        <div className={styles.report} role="status">
          <p>
            <strong>{report.fileName}</strong>: {report.invoices.length} invoice{report.invoices.length === 1 ? "" : "s"} loaded
            {report.skippedDuplicates > 0 ? `, ${report.skippedDuplicates} exact duplicate row${report.skippedDuplicates === 1 ? "" : "s"} skipped` : ""}.
          </p>
          {report.problems.length > 0 ? (
            <ul>
              {report.problems.map((p) => (
                <li key={`${p.line}-${p.message}`}>
                  Line {p.line}: {p.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { encodeQr } from "@/hooks/useReceiptQr";
import { explainError } from "@/lib/errors";
import type { QrMatrix } from "@/lib/qr";
import {
  buildReceiptExport,
  receiptFileBase,
  receiptJsonText,
  type ReceiptExportFacts,
} from "@/lib/receiptExport";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import styles from "./Receipt.module.css";

/** Everything but the moment of export, which is stamped when the button is pressed. */
type Facts = Omit<ReceiptExportFacts, "generatedAt">;

/**
 * Takes the settled receipt off the chain and onto the reader's disk.
 *
 * Only rendered once the contract says the invoice is paid: there is nothing to keep before that.
 * Both files are built in the tab from the same contract read the page is showing — no backend,
 * and nothing is uploaded. jsPDF is only fetched when the PDF button is pressed.
 */
export function ReceiptExportButtons({ facts, qr }: { facts: Facts; qr: QrMatrix | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const build = () => buildReceiptExport({ ...facts, generatedAt: new Date() });

  const downloadJson = () => {
    setError(null);
    try {
      const receipt = build();
      saveBlob(
        new Blob([receiptJsonText(receipt)], { type: "application/json" }),
        `${receiptFileBase(receipt)}.json`,
      );
      setSaved("JSON");
    } catch (e) {
      setSaved(null);
      setError(explainError(e));
    }
  };

  const downloadPdf = async () => {
    setError(null);
    setBusy(true);
    try {
      const receipt = build();
      // The page has usually encoded the code already; this only does work if it hasn't.
      const matrix = qr ?? (await encodeQr(facts.receiptUrl));
      await downloadReceiptPdf({ receipt, qr: matrix });
      setSaved("PDF");
    } catch (e) {
      setSaved(null);
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.exportRow}>
      <h2 className={styles.exportTitle}>Keep a copy</h2>
      <div className={styles.exportButtons}>
        <button type="button" className="btn btn-small" onClick={downloadJson}>
          Download JSON
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void downloadPdf()}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? "Making the PDF…" : "Download PDF"}
        </button>
      </div>
      <p className={styles.exportNote}>
        Built in this tab from the contract read above. The JSON holds the exact base units; the PDF is this slip, with
        the QR code.
      </p>
      <p className={styles.exportError} aria-live="polite">
        {error ? `Couldn't make the file: ${error}` : null}
      </p>
      <span className="visually-hidden" aria-live="polite">
        {saved && !error ? `${saved} receipt downloaded.` : ""}
      </span>
    </div>
  );
}

/**
 * Hands a blob to the browser's own download path.
 *
 * The anchor has to be in the document for Firefox to honour the click, and the object URL is
 * released on the next tick, once the download has taken it.
 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

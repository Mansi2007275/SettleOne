"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { LoggerMessage, Worker as OcrWorker } from "tesseract.js";
import { parseInvoiceText, scanFoundSomething, type ScanResult } from "@/lib/invoiceScan";
import styles from "./Bench.module.css";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const STATUS_TEXT: Record<string, string> = {
  "loading tesseract core": "Loading the reader",
  "initializing tesseract": "Loading the reader",
  "initialized tesseract": "Loading the reader",
  "loading language traineddata": "Loading the English language data",
  "loaded language traineddata": "Loading the English language data",
  "initializing api": "Getting ready",
  "initialized api": "Getting ready",
  "recognizing text": "Reading the invoice",
};

type CreateWorker = (
  langs?: string,
  oem?: number,
  options?: { logger?: (message: LoggerMessage) => void; errorHandler?: (error: unknown) => void },
) => Promise<OcrWorker>;

/**
 * tesseract.js and its wasm core are big, so they are never part of the first page load: this
 * dynamic import creates its own chunk, fetched when the user opens the scanner. The image itself
 * is handed straight to the worker inside this tab — nothing is uploaded anywhere.
 */
async function loadCreateWorker(): Promise<CreateWorker> {
  const mod = (await import("tesseract.js")) as unknown as {
    createWorker?: CreateWorker;
    default?: { createWorker?: CreateWorker };
  };
  const createWorker = mod.createWorker ?? mod.default?.createWorker;
  if (!createWorker) throw new Error("tesseract.js did not expose createWorker");
  return createWorker;
}

export function InvoiceScanner({ onScanned }: { onScanned: (result: ScanResult) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<OcrWorker | null>(null);
  const cancelledRef = useRef(false);
  const previewRef = useRef<string | null>(null);
  const warmRef = useRef<Promise<CreateWorker> | null>(null);

  const setPreviewUrl = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      void workerRef.current?.terminate();
    },
    [],
  );

  const warm = () => {
    if (warmRef.current) return;
    const loading = loadCreateWorker();
    loading.catch(() => {
      if (warmRef.current === loading) warmRef.current = null;
    });
    warmRef.current = loading;
  };

  const reset = () => {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setStatus("");
  };

  const cancel = () => {
    cancelledRef.current = true;
    const worker = workerRef.current;
    workerRef.current = null;
    void worker?.terminate();
    setBusy(false);
    setProgress(0);
    setStatus("");
  };

  const run = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    setResult(null);

    if (!ACCEPTED.includes(file.type)) {
      setPreviewUrl(null);
      setError("Use a JPG, PNG or WebP photo of the invoice.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setPreviewUrl(null);
      setError(`That image is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 8 MB.`);
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    cancelledRef.current = false;
    setBusy(true);
    setProgress(0);
    setStatus("Loading the reader");

    try {
      warm();
      const createWorker = await warmRef.current!;
      if (cancelledRef.current) return;

      const worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (cancelledRef.current) return;
          setStatus(STATUS_TEXT[message.status] ?? message.status);
          setProgress(Number.isFinite(message.progress) ? message.progress : 0);
        },
      });
      workerRef.current = worker;
      if (cancelledRef.current) {
        await worker.terminate();
        return;
      }

      const recognized = await worker.recognize(file);
      await worker.terminate();
      workerRef.current = null;
      if (cancelledRef.current) return;

      const scan = parseInvoiceText(recognized.data.text ?? "");
      setResult(scan);
      onScanned(scan);
    } catch {
      if (!cancelledRef.current) {
        setError(
          "Couldn't read that image. The reader downloads its language data the first time, so check your connection — or just type the invoice in below.",
        );
      }
    } finally {
      if (!cancelledRef.current) {
        setBusy(false);
        setProgress(0);
        setStatus("");
      }
    }
  };

  const pick = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (input) input.value = "";
    void run(file);
  };

  const found = result ? scanFoundSomething(result) : false;

  return (
    <section className={`panel ${styles.scan}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Scan invoice</h2>
      <p className="panel-note">
        Optional. Take a photo of a paper or PDF invoice and the form below is filled in for you to check. The reading
        happens inside this browser tab — the image is never uploaded.
      </p>

      {!open ? (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setOpen(true);
            warm();
          }}
        >
          Scan invoice
        </button>
      ) : (
        <>
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            onChange={() => pick(fileRef.current)}
          />
          <input
            ref={cameraRef}
            id={`${id}-camera`}
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            onChange={() => pick(cameraRef.current)}
          />

          <div
            className={styles.scanDrop}
            data-drag={dragging ? "yes" : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void run(e.dataTransfer.files?.[0]);
            }}
          >
            <p className={styles.scanDropText}>Drop an invoice image here</p>
            <p className={styles.scanDropHint}>JPG, PNG or WebP, up to 8 MB</p>
            <div className={styles.scanActions}>
              <label htmlFor={`${id}-file`} className="btn btn-small" aria-disabled={busy ? "true" : undefined}>
                Choose image
              </label>
              <label htmlFor={`${id}-camera`} className="btn btn-small" aria-disabled={busy ? "true" : undefined}>
                Use camera
              </label>
            </div>
          </div>

          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className={styles.scanPreview} src={preview} alt="The invoice image you picked" />
          ) : null}

          {busy ? (
            <div className={styles.scanProgress}>
              <div
                className={styles.scanTrack}
                role="progressbar"
                aria-label="Reading the invoice"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
              >
                <span className={styles.scanBar} style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }} />
              </div>
              <div className={styles.scanProgressRow}>
                <span className={styles.scanStatus} aria-live="polite">
                  {status}
                </span>
                <button type="button" className="btn btn-small btn-ghost" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className={styles.scanError} role="status">
              {error}
            </p>
          ) : null}

          {result ? (
            <>
              <p className={styles.scanReport} role="status">
                {found
                  ? "Filled in what the image showed. Check every field below, especially the highlighted ones, then press Add to desk yourself."
                  : "Nothing readable in that image. Type the invoice in below."}
              </p>
              <details className={styles.scanRaw}>
                <summary>Text we read</summary>
                <pre>{result.rawText.trim() || "(empty)"}</pre>
              </details>
            </>
          ) : null}

          <div className={styles.scanActions}>
            {preview || result || error ? (
              <button type="button" className="btn btn-small btn-ghost" onClick={reset} disabled={busy}>
                Clear image
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                cancel();
                reset();
                setOpen(false);
              }}
            >
              Close scanner
            </button>
          </div>
        </>
      )}
    </section>
  );
}

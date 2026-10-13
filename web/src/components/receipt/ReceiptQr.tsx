"use client";

import { QR_CAPTION, qrPath, qrSide, type QrMatrix } from "@/lib/qr";
import styles from "./Receipt.module.css";

/**
 * The receipt URL as a QR code, drawn from the bit matrix so the modules can be inked with
 * `currentColor` — which the slip points at `var(--ink)`, right in both themes.
 *
 * The box keeps its size while the encoder is still loading, so the slip doesn't jump.
 */
export function ReceiptQr({ matrix, failed }: { matrix: QrMatrix | null; failed: boolean }) {
  return (
    <figure className={styles.qr}>
      <div className={styles.qrBox}>
        {matrix ? (
          <svg
            viewBox={`0 0 ${qrSide(matrix)} ${qrSide(matrix)}`}
            width="100%"
            height="100%"
            role="img"
            aria-label="QR code for this receipt page"
            shapeRendering="crispEdges"
          >
            <path d={qrPath(matrix)} fill="currentColor" />
          </svg>
        ) : (
          <span className={styles.qrWait}>{failed ? "QR code unavailable" : "Making the code…"}</span>
        )}
      </div>
      <figcaption>{QR_CAPTION}</figcaption>
    </figure>
  );
}

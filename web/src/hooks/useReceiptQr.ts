"use client";

import { useEffect, useState } from "react";
import type { QrMatrix } from "@/lib/qr";

/**
 * Encodes the receipt URL as a QR bit matrix with the pinned `qrcode` package.
 *
 * The package is imported dynamically so it is its own chunk, fetched after the receipt has
 * painted rather than as part of the first load. Only the encoder is used: the drawing happens in
 * `@/lib/qr`, because the code has to be inked with `var(--ink)` and that renderer only takes
 * literal hex colours.
 *
 * Error correction level M: enough redundancy for a printed slip, without inflating the symbol.
 */
type QrCreate = (text: string, options?: { errorCorrectionLevel?: "M" }) => { modules: QrMatrix };

let loading: Promise<QrCreate> | null = null;

function loadCreate(): Promise<QrCreate> {
  if (!loading) {
    loading = import("qrcode")
      .then((mod) => {
        const m = mod as unknown as { create?: QrCreate; default?: { create?: QrCreate } };
        const create = m.create ?? m.default?.create;
        if (!create) throw new Error("qrcode did not expose create");
        return create;
      })
      .catch((error: unknown) => {
        loading = null; // a failed fetch shouldn't poison every later attempt
        throw error;
      });
  }
  return loading;
}

/** Encodes `text`, loading the encoder on first use. Safe to call again: the module is cached. */
export async function encodeQr(text: string): Promise<QrMatrix> {
  const create = await loadCreate();
  return create(text, { errorCorrectionLevel: "M" }).modules;
}

export type ReceiptQr = { matrix: QrMatrix | null; failed: boolean };

/** Encodes `text` once it is known. `null` means "not in the browser yet", not "failed". */
export function useReceiptQr(text: string | null): ReceiptQr {
  const [qr, setQr] = useState<ReceiptQr>({ matrix: null, failed: false });

  useEffect(() => {
    if (!text) {
      setQr({ matrix: null, failed: false });
      return;
    }
    let live = true;
    setQr({ matrix: null, failed: false });
    encodeQr(text).then(
      (matrix) => {
        if (live) setQr({ matrix, failed: false });
      },
      () => {
        if (live) setQr({ matrix: null, failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, [text]);

  return qr;
}

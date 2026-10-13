/**
 * What kind of file landed on the invoice-file bench.
 *
 * The bench loads a CSV of invoices. People also hand it a photo of a paper invoice, because
 * that is the file they have — and a photo is always bigger than the 64 KB a 20-row CSV needs,
 * so the old size error ("larger than 64 KB") was both true and useless. Classify the file
 * first, so an image or a PDF is answered with the scanner instead of a size complaint.
 *
 * Pure: nothing here reads the file, only its name and the type the browser reported. The type
 * is missing often enough (drag-and-drop, odd browsers) that the extension is checked too.
 */

export type DeskFileKind = "csv" | "image" | "pdf" | "unknown";

/** A 20-row invoice CSV is a couple of KB. Anything far past that is not an invoice file. */
export const MAX_CSV_BYTES = 64 * 1024;

/** Shown when a picture of an invoice is dropped on the CSV bench. */
export const SCAN_INSTEAD_MESSAGE = "That looks like an invoice image. Use Scan invoice above to read it.";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif", "tif", "tiff"];
const CSV_TYPES = ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", ""];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function classifyDeskFile(file: { name: string; type: string }): DeskFileKind {
  const type = file.type.toLowerCase();
  const extension = extensionOf(file.name);

  if (type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extension)) return "image";
  if (type === "application/pdf" || extension === "pdf") return "pdf";
  if (extension === "csv" || (CSV_TYPES.includes(type) && extension !== "")) return "csv";
  return "unknown";
}

export type DeskFileCheck =
  /** Read it as a CSV. */
  | { ok: true }
  /** An invoice image or PDF: offer the scanner, which is what the user actually wanted. */
  | { ok: false; reason: "scan"; kind: "image" | "pdf"; message: string }
  /** A plausible CSV, but far too big to be one. */
  | { ok: false; reason: "size"; message: string };

/**
 * Decide what to do with a file chosen or dropped on the invoice-file bench. The kind is settled
 * before the size, so an 8 MB invoice photo is never reported as an oversized CSV.
 */
export function checkDeskFile(file: { name: string; type: string; size: number }): DeskFileCheck {
  const kind = classifyDeskFile(file);
  if (kind === "image" || kind === "pdf") {
    return { ok: false, reason: "scan", kind, message: SCAN_INSTEAD_MESSAGE };
  }
  if (file.size > MAX_CSV_BYTES) {
    return {
      ok: false,
      reason: "size",
      message: "That file is larger than 64 KB. An invoice file holds at most 20 rows.",
    };
  }
  return { ok: true };
}

/** The scanner only reads images; a PDF has to be photographed or exported first. */
export function canHandOffToScanner(kind: "image" | "pdf"): boolean {
  return kind === "image";
}

import { describe, expect, it } from "vitest";
import {
  MAX_CSV_BYTES,
  SCAN_INSTEAD_MESSAGE,
  canHandOffToScanner,
  checkDeskFile,
  classifyDeskFile,
} from "./deskFile";

/** A file the way the browser hands it over: a name, a type it may have guessed, a size. */
const file = (name: string, type: string, size = 1_024) => ({ name, type, size });

describe("what kind of file this is", () => {
  it("reads a CSV from its type or its extension", () => {
    expect(classifyDeskFile(file("invoices.csv", "text/csv"))).toBe("csv");
    expect(classifyDeskFile(file("INVOICES.CSV", ""))).toBe("csv");
    // Windows with Excel installed reports a CSV as a spreadsheet.
    expect(classifyDeskFile(file("invoices.csv", "application/vnd.ms-excel"))).toBe("csv");
  });

  it("reads an invoice photo, with or without a type", () => {
    expect(classifyDeskFile(file("invoice.png", "image/png"))).toBe("image");
    expect(classifyDeskFile(file("IMG_2048.JPG", ""))).toBe("image");
    expect(classifyDeskFile(file("scan.webp", "image/webp"))).toBe("image");
    expect(classifyDeskFile(file("photo", "image/heic"))).toBe("image");
  });

  it("reads a PDF", () => {
    expect(classifyDeskFile(file("invoice.pdf", "application/pdf"))).toBe("pdf");
    expect(classifyDeskFile(file("invoice.PDF", ""))).toBe("pdf");
  });

  it("leaves anything else unknown rather than guessing", () => {
    expect(classifyDeskFile(file("notes.docx", "application/zip"))).toBe("unknown");
    expect(classifyDeskFile(file("invoices", ""))).toBe("unknown");
  });
});

describe("the invoice-file bench", () => {
  it("sends an invoice image to the scanner instead of complaining about its size", () => {
    const result = checkDeskFile(file("invoice.png", "image/png", 2_400_000));
    expect(result).toEqual({ ok: false, reason: "scan", kind: "image", message: SCAN_INSTEAD_MESSAGE });
  });

  it("sends a PDF the same way", () => {
    const result = checkDeskFile(file("invoice.pdf", "application/pdf", 90_000));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("scan");
  });

  it("still refuses a CSV far too big to be twenty rows", () => {
    const result = checkDeskFile(file("huge.csv", "text/csv", MAX_CSV_BYTES + 1));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("size");
  });

  it("accepts a CSV at the limit, and an unknown file it can try to parse", () => {
    expect(checkDeskFile(file("invoices.csv", "text/csv", MAX_CSV_BYTES))).toEqual({ ok: true });
    expect(checkDeskFile(file("invoices", "", 200))).toEqual({ ok: true });
  });
});

describe("handing the file to the scanner", () => {
  it("offers an image to the reader, but not a PDF the reader can't open", () => {
    expect(canHandOffToScanner("image")).toBe(true);
    expect(canHandOffToScanner("pdf")).toBe(false);
  });
});

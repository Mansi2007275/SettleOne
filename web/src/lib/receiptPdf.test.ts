import { describe, expect, it } from "vitest";
import { normalizeHex, pdfPalette, PDF_PALETTE_FALLBACK } from "./receiptPdf";

describe("normalizeHex", () => {
  it("keeps a six-digit hex, lower-cased", () => {
    expect(normalizeHex("#1C0F06")).toBe("#1c0f06");
    expect(normalizeHex("  #f7ddb8  ")).toBe("#f7ddb8");
  });

  it("expands a three-digit hex", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
  });

  it("refuses anything jsPDF would misread as black", () => {
    for (const value of [
      undefined,
      "",
      "   ",
      "rgb(28 15 6 / 0.35)",
      "color-mix(in srgb, #fff, #000)",
      "var(--ink)",
      "#12345",
      "#12345g",
      "1c0f06",
      "tomato",
    ]) {
      expect(normalizeHex(value)).toBeUndefined();
    }
  });
});

describe("pdfPalette", () => {
  it("takes every token from the page when they are all hex", () => {
    const tokens: Record<string, string> = {
      "--paper": "#ffffff",
      "--ink": "#000000",
      "--ink-soft": "#555555",
      "--accent-ink": "#8f3400",
    };
    expect(pdfPalette((token) => tokens[token])).toEqual({
      paper: "#ffffff",
      ink: "#000000",
      inkSoft: "#555555",
      accentInk: "#8f3400",
    });
  });

  it("falls back token by token, not all at once", () => {
    const palette = pdfPalette((token) => (token === "--ink" ? "#123456" : "rgb(1 2 3)"));
    expect(palette.ink).toBe("#123456");
    expect(palette.paper).toBe(PDF_PALETTE_FALLBACK.paper);
    expect(palette.inkSoft).toBe(PDF_PALETTE_FALLBACK.inkSoft);
    expect(palette.accentInk).toBe(PDF_PALETTE_FALLBACK.accentInk);
  });

  it("is the token defaults when nothing can be read", () => {
    expect(pdfPalette(() => undefined)).toEqual(PDF_PALETTE_FALLBACK);
  });

  it("never hands jsPDF a non-hex value", () => {
    const palette = pdfPalette(() => "color-mix(in srgb, #fff, #000)");
    for (const value of Object.values(palette)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
});

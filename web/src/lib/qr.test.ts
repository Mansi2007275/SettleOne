import { describe, expect, it } from "vitest";
import { QR_QUIET_ZONE, qrPath, qrRuns, qrSide, type QrMatrix } from "./qr";

/** A matrix from rows of "#" (dark) and "." (light), so a fixture reads like the code it draws. */
function matrix(rows: string[]): QrMatrix {
  const size = rows.length;
  const data = new Uint8Array(size * size);
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`fixture row ${y} is ${row.length} wide, expected ${size}`);
    [...row].forEach((cell, x) => {
      data[y * size + x] = cell === "#" ? 1 : 0;
    });
  });
  return { size, data };
}

const Q = QR_QUIET_ZONE;

describe("qrSide", () => {
  it("adds the quiet zone on both sides", () => {
    expect(qrSide(matrix(["#.", ".#"]))).toBe(2 + Q * 2);
    expect(qrSide({ size: 33, data: new Uint8Array(33 * 33) })).toBe(33 + Q * 2);
  });
});

describe("qrRuns", () => {
  it("offsets every module by the quiet zone", () => {
    expect(qrRuns(matrix(["#.", ".."]))).toEqual([{ x: Q, y: Q, width: 1 }]);
  });

  it("collapses consecutive dark modules in a row into one run", () => {
    expect(qrRuns(matrix(["###.", "....", "....", "...."]))).toEqual([{ x: Q, y: Q, width: 3 }]);
  });

  it("keeps a gap in a row as two runs", () => {
    expect(qrRuns(matrix(["##.#", "....", "....", "...."]))).toEqual([
      { x: Q, y: Q, width: 2 },
      { x: Q + 3, y: Q, width: 1 },
    ]);
  });

  it("closes a run that reaches the right edge", () => {
    expect(qrRuns(matrix([".###", "....", "....", "...."]))).toEqual([{ x: Q + 1, y: Q, width: 3 }]);
  });

  it("never merges across rows, and returns rows top to bottom", () => {
    expect(qrRuns(matrix(["##", "##"]))).toEqual([
      { x: Q, y: Q, width: 2 },
      { x: Q, y: Q + 1, width: 2 },
    ]);
  });

  it("is empty for an all-light matrix", () => {
    expect(qrRuns(matrix(["..", ".."]))).toEqual([]);
  });

  it("treats any non-zero module value as dark", () => {
    expect(qrRuns({ size: 2, data: [0, 2, 0, 0] })).toEqual([{ x: Q + 1, y: Q, width: 1 }]);
  });

  it("covers every dark module exactly once", () => {
    const rows = ["#.#.#", ".###.", "#...#", "#####", "....."];
    const covered = new Set<string>();
    for (const run of qrRuns(matrix(rows))) {
      for (let i = 0; i < run.width; i += 1) {
        const cell = `${run.x - Q + i},${run.y - Q}`;
        expect(covered.has(cell)).toBe(false);
        covered.add(cell);
      }
    }
    const dark = rows.flatMap((row, y) => [...row].map((cell, x) => (cell === "#" ? `${x},${y}` : null)));
    expect(covered).toEqual(new Set(dark.filter((cell): cell is string => cell !== null)));
  });
});

describe("qrPath", () => {
  it("draws one closed rectangle per run", () => {
    expect(qrPath(matrix(["##.", "...", "..#"]))).toBe(`M${Q} ${Q}h2v1h-2zM${Q + 2} ${Q + 2}h1v1h-1z`);
  });

  it("is an empty string when nothing is dark", () => {
    expect(qrPath(matrix(["..", ".."]))).toBe("");
  });
});

describe("matrix validation", () => {
  it("refuses a size that is not a positive integer", () => {
    expect(() => qrRuns({ size: 0, data: [] })).toThrow(/positive integer/);
    expect(() => qrSide({ size: -3, data: [] })).toThrow(/positive integer/);
    expect(() => qrPath({ size: 2.5, data: [] })).toThrow(/positive integer/);
  });

  it("refuses data that is not size squared", () => {
    expect(() => qrRuns({ size: 3, data: new Uint8Array(8) })).toThrow(/expected 9/);
  });
});

/**
 * QR geometry.
 *
 * The `qrcode` package does the encoding (`QRCode.create`) and hands back a bit matrix. The
 * drawing is done here instead of by its own SVG renderer for one reason: that renderer only
 * accepts literal hex colours, and the page has to draw the code in `var(--ink)` so it stays
 * right in both themes. Turning the matrix into an SVG path lets the ink be `currentColor`, and
 * the same runs are reused to draw the code into the PDF as vector rectangles.
 *
 * Coordinates are module units, with the quiet zone already added, so an SVG `viewBox` of
 * `0 0 side side` needs no extra padding.
 */

/** What the code is for, said once: the page and the PDF print the same caption. */
export const QR_CAPTION = "Scan to verify on chain";

/** Four blank modules on every side: the minimum a scanner needs to find the symbol. */
export const QR_QUIET_ZONE = 4;

/** The part of `QRCode.create(...).modules` this file needs. */
export type QrMatrix = { size: number; data: ArrayLike<number> };

/** One row of consecutive dark modules. */
export type QrRun = { x: number; y: number; width: number };

/** Side of the drawing area in module units, quiet zone included. */
export function qrSide(matrix: QrMatrix): number {
  return checkedSize(matrix) + QR_QUIET_ZONE * 2;
}

/**
 * Dark modules collapsed into horizontal runs, so a row of five dark modules is one rectangle
 * rather than five. Rows are returned top to bottom, runs left to right.
 */
export function qrRuns(matrix: QrMatrix): QrRun[] {
  const size = checkedSize(matrix);
  const runs: QrRun[] = [];

  for (let row = 0; row < size; row += 1) {
    let start = -1;
    // One past the last column, so a run that reaches the edge is still closed.
    for (let col = 0; col <= size; col += 1) {
      const dark = col < size && matrix.data[row * size + col] !== 0;
      if (dark && start < 0) start = col;
      else if (!dark && start >= 0) {
        runs.push({ x: start + QR_QUIET_ZONE, y: row + QR_QUIET_ZONE, width: col - start });
        start = -1;
      }
    }
  }

  return runs;
}

/** The same runs as one SVG path `d`, to be filled with `currentColor`. */
export function qrPath(matrix: QrMatrix): string {
  return qrRuns(matrix)
    .map(({ x, y, width }) => `M${x} ${y}h${width}v1h-${width}z`)
    .join("");
}

function checkedSize(matrix: QrMatrix): number {
  const { size, data } = matrix;
  if (!Number.isInteger(size) || size <= 0) throw new Error(`QR matrix size must be a positive integer, got ${size}`);
  if (data.length !== size * size) {
    throw new Error(`QR matrix holds ${data.length} modules, expected ${size * size}`);
  }
  return size;
}

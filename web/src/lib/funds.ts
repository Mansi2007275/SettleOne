/**
 * Does the paying wallet hold enough for an invoice, and what does the gas cost in invoice units?
 *
 * On Arc one asset pays for both: the invoice moves through the USDC ERC-20 interface (6 decimals)
 * while gas is charged against native USDC (18 decimals). Same balance, two decimal scales, so the
 * fee has to be brought down to 6 decimals before it can be added to an invoice amount.
 */

/** 18-decimal native wei -> 6-decimal USDC units. */
const NATIVE_TO_USDC_SCALE = 10n ** 12n;

/** 4 decimals, expressed in 6-decimal units: the finest step the fee is ever shown at. */
const DISPLAY_STEP = 100n;

/**
 * Fee for `gas` units at `gasPrice` wei, in 6-decimal USDC units, **rounded up**.
 * Rounding up on purpose: the number is used to warn about a short balance, and a fee quoted a
 * millionth too high is harmless where one quoted too low lets a payment fail in the wallet.
 */
export function nativeFeeToUsdcUnits(gas: bigint, gasPrice: bigint): bigint {
  const wei = gas * gasPrice;
  if (wei <= 0n) return 0n;
  return (wei + NATIVE_TO_USDC_SCALE - 1n) / NATIVE_TO_USDC_SCALE;
}

/** Can this balance cover the invoice and its gas? */
export function hasEnough(balanceUnits: bigint, amountUnits: bigint, feeUnits: bigint): boolean {
  return balanceUnits >= amountUnits + feeUnits;
}

/** How much more is needed to cover amount + fee. 0 when the balance already covers both. */
export function shortfall(balanceUnits: bigint, amountUnits: bigint, feeUnits: bigint): bigint {
  const need = amountUnits + feeUnits;
  return balanceUnits >= need ? 0n : need - balanceUnits;
}

/**
 * The fee rounded up to 4 decimals, so `formatUsdc` prints at most 4 of them. A fee smaller than
 * that still shows as 0.0001 rather than 0.00, which would read as free.
 */
export function displayFeeUnits(feeUnits: bigint): bigint {
  if (feeUnits <= 0n) return 0n;
  return ((feeUnits + DISPLAY_STEP - 1n) / DISPLAY_STEP) * DISPLAY_STEP;
}

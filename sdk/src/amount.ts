import { formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";
import { USDC_DECIMALS } from "./chains.ts";
import { SettleOnceError } from "./errors.ts";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

/**
 * A human USDC amount ("0.01", 1250, "1250.50") as 6-decimal base units.
 *
 * Strict on purpose, because an agent parsing a bills file is exactly where a silent rounding
 * error turns into a wrong payment: no commas, no currency signs, no exponent, no negatives, at
 * most 6 decimals, more than zero. A JavaScript number is accepted but must be finite and must
 * not be in exponent form, so 1e21 is refused rather than quietly becoming a huge payment.
 */
export function parseUsdcAmount(input: string | number): bigint {
  const text = typeof input === "number" ? numberToPlainString(input) : input.trim();
  if (text === "") throw new SettleOnceError("invalid-amount", "Amount is required.");
  if (!AMOUNT_PATTERN.test(text)) {
    throw new SettleOnceError(
      "invalid-amount",
      `"${text}" is not a plain USDC amount. Use something like 12.50 — max 6 decimals, no commas, no currency sign.`,
    );
  }
  const units = parseUnits(text, USDC_DECIMALS);
  if (units === 0n) throw new SettleOnceError("invalid-amount", "Amount must be more than 0.");
  return units;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new SettleOnceError("invalid-amount", `"${value}" is not a finite amount.`);
  const text = String(value);
  if (/e/i.test(text)) {
    throw new SettleOnceError("invalid-amount", `"${text}" is in exponent form. Pass the amount as a string instead.`);
  }
  return text;
}

/** 100000n -> "0.10". At least two decimals, nothing beyond six, no thousands separators. */
export function formatUsdcAmount(units: bigint): string {
  const [whole, frac = ""] = formatUnits(units, USDC_DECIMALS).split(".");
  return `${whole}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}

/** A checksummed address, or a SettleOnceError naming the field that was wrong. */
export function requireAddress(value: string, label: string): Address {
  const text = value?.trim?.() ?? "";
  if (!isAddress(text, { strict: false })) {
    throw new SettleOnceError("invalid-address", `${label} "${value}" is not a valid 0x address.`);
  }
  const address = getAddress(text);
  if (/^0x0{40}$/.test(address.toLowerCase())) {
    throw new SettleOnceError("invalid-address", `${label} can't be the zero address.`);
  }
  return address;
}

/** Arc's fee floor applied to an estimate. Pure, so the floor itself is testable. */
export function floorMaxFee(
  estimate: { maxFeePerGas?: bigint | undefined; maxPriorityFeePerGas?: bigint | undefined } | undefined,
  floor: bigint,
): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const estimated = estimate?.maxFeePerGas ?? 0n;
  const maxFeePerGas = estimated > floor ? estimated : floor;
  const priority = estimate?.maxPriorityFeePerGas ?? 0n;
  // The priority fee can never exceed the cap it is paid out of.
  const maxPriorityFeePerGas = priority > maxFeePerGas ? maxFeePerGas : priority;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

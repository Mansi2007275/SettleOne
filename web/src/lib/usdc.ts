import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "@/config/env";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

export type AmountResult = { ok: true; units: bigint; text: string } | { ok: false; error: string };

/**
 * Parse a human USDC amount ("0.10", "1250") into 6-decimal base units.
 * Strict on purpose: no commas, no signs, no exponent, at most 6 decimals.
 */
export function parseUsdc(input: string): AmountResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter an amount." };
  if (!AMOUNT_PATTERN.test(text)) {
    return { ok: false, error: "Use a plain number like 12.50 (max 6 decimals, no commas)." };
  }
  const units = parseUnits(text, USDC_DECIMALS);
  if (units === 0n) return { ok: false, error: "Amount must be more than 0." };
  return { ok: true, units, text: formatUsdc(units) };
}

/** 100000n -> "0.10"; always at least 2 decimals, trailing zeros beyond that trimmed. */
export function formatUsdc(units: bigint): string {
  const raw = formatUnits(units, USDC_DECIMALS);
  const [whole, frac = ""] = raw.split(".");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${trimmed}`;
}

/** Same as formatUsdc but without thousands separators, for CSV files. */
export function formatUsdcPlain(units: bigint): string {
  return formatUsdc(units).replace(/,/g, "");
}

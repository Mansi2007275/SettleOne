import { describe, expect, it } from "vitest";
import { displayFeeUnits, hasEnough, nativeFeeToUsdcUnits, shortfall } from "./funds";

/** 10^12 wei is exactly one 6-decimal USDC unit (0.000001 USDC). */
const ONE_UNIT_IN_WEI = 10n ** 12n;

describe("nativeFeeToUsdcUnits", () => {
  it("converts a whole number of units exactly", () => {
    // 21,000 gas at 10^12 wei = 21,000 units = 0.021 USDC
    expect(nativeFeeToUsdcUnits(21_000n, ONE_UNIT_IN_WEI)).toBe(21_000n);
  });

  it("rounds up a fee that is a fraction of one unit", () => {
    expect(nativeFeeToUsdcUnits(1n, 1n)).toBe(1n);
    expect(nativeFeeToUsdcUnits(1n, ONE_UNIT_IN_WEI - 1n)).toBe(1n);
  });

  it("rounds up anything above an exact unit boundary", () => {
    expect(nativeFeeToUsdcUnits(1n, ONE_UNIT_IN_WEI + 1n)).toBe(2n);
    // 150,000 gas at 1 wei over a unit: 150,000 units plus a sliver -> one more unit
    expect(nativeFeeToUsdcUnits(150_000n, ONE_UNIT_IN_WEI + 1n)).toBe(150_001n);
  });

  it("leaves an exact boundary alone", () => {
    expect(nativeFeeToUsdcUnits(3n, ONE_UNIT_IN_WEI)).toBe(3n);
    expect(nativeFeeToUsdcUnits(150_000n, 2n * ONE_UNIT_IN_WEI)).toBe(300_000n);
  });

  it("is zero when either side is zero", () => {
    expect(nativeFeeToUsdcUnits(0n, ONE_UNIT_IN_WEI)).toBe(0n);
    expect(nativeFeeToUsdcUnits(150_000n, 0n)).toBe(0n);
    expect(nativeFeeToUsdcUnits(0n, 0n)).toBe(0n);
  });

  it("handles huge values without losing precision", () => {
    const gas = 30_000_000n;
    const gasPrice = 10n ** 18n; // absurd, but bigint arithmetic must not drift
    expect(nativeFeeToUsdcUnits(gas, gasPrice)).toBe(30_000_000n * 10n ** 6n);

    // One wei more than a clean boundary, at scale: still exactly one unit more.
    expect(nativeFeeToUsdcUnits(1n, 10n ** 30n + 1n)).toBe(10n ** 18n + 1n);
  });
});

describe("hasEnough", () => {
  const amount = 1_500_000n; // 1.50 USDC
  const fee = 2_000n; // 0.002 USDC

  it("is true with room to spare", () => {
    expect(hasEnough(5_000_000n, amount, fee)).toBe(true);
  });

  it("is true at the exact boundary", () => {
    expect(hasEnough(amount + fee, amount, fee)).toBe(true);
  });

  it("is false one unit short", () => {
    expect(hasEnough(amount + fee - 1n, amount, fee)).toBe(false);
  });

  it("ignores the fee when it is zero", () => {
    expect(hasEnough(amount, amount, 0n)).toBe(true);
    expect(hasEnough(amount - 1n, amount, 0n)).toBe(false);
  });

  it("is false for an empty wallet", () => {
    expect(hasEnough(0n, amount, fee)).toBe(false);
    expect(hasEnough(0n, 0n, 0n)).toBe(true);
  });

  it("holds for huge values", () => {
    const huge = 10n ** 30n;
    expect(hasEnough(huge, huge, 0n)).toBe(true);
    expect(hasEnough(huge, huge, 1n)).toBe(false);
  });
});

describe("shortfall", () => {
  const amount = 1_500_000n;
  const fee = 2_000n;

  it("is zero when the balance covers amount and fee", () => {
    expect(shortfall(5_000_000n, amount, fee)).toBe(0n);
  });

  it("is zero at the exact boundary", () => {
    expect(shortfall(amount + fee, amount, fee)).toBe(0n);
  });

  it("is the missing amount, fee included", () => {
    expect(shortfall(amount, amount, fee)).toBe(fee);
    expect(shortfall(amount + fee - 1n, amount, fee)).toBe(1n);
    expect(shortfall(0n, amount, fee)).toBe(amount + fee);
  });

  it("drops the fee term when the fee is zero", () => {
    expect(shortfall(1_000_000n, amount, 0n)).toBe(500_000n);
  });

  it("never goes negative", () => {
    expect(shortfall(10n ** 12n, 1n, 1n)).toBe(0n);
  });

  it("holds for huge values", () => {
    expect(shortfall(0n, 10n ** 30n, 10n ** 18n)).toBe(10n ** 30n + 10n ** 18n);
  });
});

describe("displayFeeUnits", () => {
  it("rounds a sub-0.0001 fee up to 0.0001 rather than to nothing", () => {
    expect(displayFeeUnits(1n)).toBe(100n);
    expect(displayFeeUnits(99n)).toBe(100n);
  });

  it("leaves a value already on the 4-decimal step alone", () => {
    expect(displayFeeUnits(100n)).toBe(100n);
    expect(displayFeeUnits(21_000n)).toBe(21_000n);
  });

  it("rounds up anything between steps", () => {
    expect(displayFeeUnits(101n)).toBe(200n);
    expect(displayFeeUnits(1_234_567n)).toBe(1_234_600n);
  });

  it("keeps a zero fee at zero", () => {
    expect(displayFeeUnits(0n)).toBe(0n);
  });

  it("holds for huge values", () => {
    expect(displayFeeUnits(10n ** 24n + 1n)).toBe(10n ** 24n + 100n);
  });
});

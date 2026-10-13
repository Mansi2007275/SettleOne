import { describe, expect, it } from "vitest";
import { floorMaxFee, formatUsdcAmount, parseUsdcAmount, requireAddress } from "./amount.ts";
import { MIN_MAX_FEE_PER_GAS } from "./chains.ts";
import { SettleOnceError } from "./errors.ts";

describe("parseUsdcAmount", () => {
  it("converts to 6-decimal base units", () => {
    expect(parseUsdcAmount("0.01")).toBe(10_000n);
    expect(parseUsdcAmount("0.10")).toBe(100_000n);
    expect(parseUsdcAmount("1")).toBe(1_000_000n);
    expect(parseUsdcAmount("1250.50")).toBe(1_250_500_000n);
    expect(parseUsdcAmount("0.000001")).toBe(1n);
  });

  it("takes a JavaScript number as well as a string", () => {
    expect(parseUsdcAmount(0.02)).toBe(20_000n);
    expect(parseUsdcAmount(3)).toBe(3_000_000n);
  });

  it("trims surrounding whitespace", () => {
    expect(parseUsdcAmount("  2.50 ")).toBe(2_500_000n);
  });

  it("refuses anything that is not a plain amount", () => {
    for (const bad of ["", "   ", "1,250.00", "$12.50", "12.5 USDC", "-1", "1e6", "0x10", "1.2.3", "abc", "+1"]) {
      expect(() => parseUsdcAmount(bad), bad).toThrow(SettleOnceError);
    }
  });

  it("refuses more than six decimals, instead of rounding the dust away", () => {
    expect(() => parseUsdcAmount("0.0000001")).toThrow(/max 6 decimals/);
  });

  it("refuses zero, because a zero payment is not a payment", () => {
    expect(() => parseUsdcAmount("0")).toThrow(/more than 0/);
    expect(() => parseUsdcAmount("0.000000")).toThrow(SettleOnceError);
  });

  it("refuses a number in exponent form or one that is not finite", () => {
    expect(() => parseUsdcAmount(1e21)).toThrow(/exponent form/);
    expect(() => parseUsdcAmount(Number.NaN)).toThrow(/finite/);
    expect(() => parseUsdcAmount(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it("tags its errors so an agent can branch on them", () => {
    try {
      parseUsdcAmount("1,250");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SettleOnceError);
      expect((err as SettleOnceError).code).toBe("invalid-amount");
    }
  });
});

describe("formatUsdcAmount", () => {
  it("prints at least two decimals and trims the rest", () => {
    expect(formatUsdcAmount(10_000n)).toBe("0.01");
    expect(formatUsdcAmount(100_000n)).toBe("0.10");
    expect(formatUsdcAmount(1_000_000n)).toBe("1.00");
    expect(formatUsdcAmount(1_250_500_000n)).toBe("1250.50");
    expect(formatUsdcAmount(1n)).toBe("0.000001");
    expect(formatUsdcAmount(0n)).toBe("0.00");
  });

  it("round-trips an amount through parse and back", () => {
    for (const text of ["0.01", "0.10", "1.00", "1250.50"]) {
      expect(formatUsdcAmount(parseUsdcAmount(text))).toBe(text);
    }
  });
});

describe("requireAddress", () => {
  it("returns the checksummed address", () => {
    expect(requireAddress("0x391c7b24264c2ff12306bbaa4e9285fcf34be5ef", "Recipient")).toBe(
      "0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF",
    );
  });

  it("names the field it refused", () => {
    expect(() => requireAddress("nope", "Recipient")).toThrow(/Recipient "nope"/);
    expect(() => requireAddress(`0x${"0".repeat(40)}`, "Recipient")).toThrow(/zero address/);
  });
});

describe("floorMaxFee", () => {
  it("lifts an estimate below Arc's floor up to it", () => {
    expect(floorMaxFee({ maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 0n }, MIN_MAX_FEE_PER_GAS)).toEqual({
      maxFeePerGas: MIN_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: 0n,
    });
  });

  it("keeps an estimate above the floor", () => {
    const high = MIN_MAX_FEE_PER_GAS * 3n;
    expect(floorMaxFee({ maxFeePerGas: high, maxPriorityFeePerGas: 2n }, MIN_MAX_FEE_PER_GAS)).toEqual({
      maxFeePerGas: high,
      maxPriorityFeePerGas: 2n,
    });
  });

  it("applies the floor when the RPC could not estimate at all", () => {
    expect(floorMaxFee(undefined, MIN_MAX_FEE_PER_GAS).maxFeePerGas).toBe(MIN_MAX_FEE_PER_GAS);
    expect(floorMaxFee({}, MIN_MAX_FEE_PER_GAS).maxFeePerGas).toBe(MIN_MAX_FEE_PER_GAS);
  });

  it("never lets the priority fee exceed the cap it is paid from", () => {
    const fees = floorMaxFee({ maxFeePerGas: 1n, maxPriorityFeePerGas: 10n ** 12n }, MIN_MAX_FEE_PER_GAS);
    expect(fees.maxPriorityFeePerGas).toBeLessThanOrEqual(fees.maxFeePerGas);
  });

  it("is at least 20 gwei, which is what Arc requires", () => {
    expect(MIN_MAX_FEE_PER_GAS).toBe(20_000_000_000n);
    expect(floorMaxFee({ maxFeePerGas: 0n }, MIN_MAX_FEE_PER_GAS).maxFeePerGas).toBeGreaterThanOrEqual(
      20_000_000_000n,
    );
  });
});

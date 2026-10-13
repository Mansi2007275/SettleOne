import { BaseError, ContractFunctionRevertedError, encodeErrorResult, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { settleOnceAbi } from "./abi.ts";
import { SettleOnceError, explainError, payStatusFromError, revertArgs, revertName } from "./errors.ts";

const PAYER: Address = "0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF";
const RECIPIENT: Address = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";
const KEY = "0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b" as const;

/** A real viem revert error, built from the contract's own ABI — not a hand-made shape. */
function reverted(errorName: "AlreadyPaid" | "SettlementConflict" | "TransferFailed" | "ZeroAmount", args?: unknown[]) {
  return new ContractFunctionRevertedError({
    abi: settleOnceAbi,
    data: encodeErrorResult({ abi: settleOnceAbi, errorName, args } as never),
    functionName: "payOnce",
  });
}

/** Reverts normally reach the caller wrapped a couple of layers deep. */
class Wrapper extends BaseError {
  constructor(cause: unknown) {
    super("Contract call failed", { cause: cause as BaseError });
    this.name = "WrapperError";
  }
}

describe("revertName", () => {
  it("names the custom error a call reverted with", () => {
    expect(revertName(reverted("AlreadyPaid", [PAYER, KEY, 4_210n]))).toBe("AlreadyPaid");
  });

  it("finds it through the wrapping errors viem adds", () => {
    expect(revertName(new Wrapper(reverted("TransferFailed")))).toBe("TransferFailed");
  });

  it("is undefined for anything that is not a contract revert", () => {
    expect(revertName(new Error("socket hang up"))).toBeUndefined();
    expect(revertName(new BaseError("HTTP request failed"))).toBeUndefined();
    expect(revertName("not even an error")).toBeUndefined();
    expect(revertName(undefined)).toBeUndefined();
  });
});

describe("revertArgs", () => {
  it("returns the arguments the contract reverted with", () => {
    expect(revertArgs(reverted("AlreadyPaid", [PAYER, KEY, 4_210n]))).toEqual([PAYER, KEY, 4_210n]);
  });

  it("is empty when there is nothing to report", () => {
    expect(revertArgs(new Error("nope"))).toEqual([]);
    expect(revertArgs(reverted("TransferFailed"))).toEqual([]);
  });
});

describe("payStatusFromError", () => {
  it("maps AlreadyPaid onto the already-paid status", () => {
    expect(payStatusFromError(reverted("AlreadyPaid", [PAYER, KEY, 4_210n]))).toBe("already-paid");
    expect(payStatusFromError(new Wrapper(reverted("AlreadyPaid", [PAYER, KEY, 1n])))).toBe("already-paid");
  });

  it("maps SettlementConflict onto the conflict status", () => {
    const err = reverted("SettlementConflict", [PAYER, KEY, RECIPIENT, 20_000n]);
    expect(payStatusFromError(err)).toBe("conflict");
    expect(payStatusFromError(new Wrapper(err))).toBe("conflict");
  });

  it("leaves every other failure alone, so it is thrown rather than swallowed", () => {
    expect(payStatusFromError(reverted("TransferFailed"))).toBeUndefined();
    expect(payStatusFromError(reverted("ZeroAmount"))).toBeUndefined();
    expect(payStatusFromError(new Error("insufficient funds for gas"))).toBeUndefined();
    expect(payStatusFromError(new BaseError("RPC timed out"))).toBeUndefined();
  });
});

describe("explainError", () => {
  it("says which block already holds the payment", () => {
    expect(explainError(reverted("AlreadyPaid", [PAYER, KEY, 4_210n]))).toContain("block 4210");
  });

  it("says a conflict is a different-details settlement, in base units", () => {
    const message = explainError(reverted("SettlementConflict", [PAYER, KEY, RECIPIENT, 20_000n]));
    expect(message).toContain("already settled with different details");
    expect(message).toContain("20000 base units");
    expect(message).toContain(RECIPIENT);
  });

  it("says the invoice is still unpaid when USDC refused the transfer", () => {
    expect(explainError(reverted("TransferFailed"))).toMatch(/still unpaid/);
  });

  it("falls back to the error's own message", () => {
    expect(explainError(new Error("socket hang up"))).toBe("socket hang up");
    expect(explainError(new SettleOnceError("invalid-amount", "Amount must be more than 0."))).toBe(
      "Amount must be more than 0.",
    );
    expect(explainError("plain string")).toBe("plain string");
  });
});

describe("SettleOnceError", () => {
  it("carries a code and keeps the cause", () => {
    const cause = new Error("root");
    const err = new SettleOnceError("reverted", "Payment reverted.", { cause });
    expect(err.code).toBe("reverted");
    expect(err.name).toBe("SettleOnceError");
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });
});

import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * One error type for everything this package refuses to do, with a code an agent can branch on.
 * `AlreadyPaid` and `SettlementConflict` are deliberately *not* errors: they are outcomes, and
 * `payOnce` returns them as a status with the on-chain receipt attached.
 */
export type SettleOnceErrorCode =
  | "invalid-amount"
  | "invalid-address"
  | "invalid-reference"
  | "invalid-key"
  | "no-account"
  | "reverted";

export class SettleOnceError extends Error {
  readonly code: SettleOnceErrorCode;

  constructor(code: SettleOnceErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SettleOnceError";
    this.code = code;
  }
}

/** The custom error a contract call reverted with, if it reverted with one at all. */
export function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
}

/** The arguments of that custom error, so a caller can report the block or the paid details. */
export function revertArgs(err: unknown): readonly unknown[] {
  if (!(err instanceof BaseError)) return [];
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? (revert.data?.args ?? []) : [];
}

/**
 * The two reverts that mean "this invoice is settled, stop trying": the guard did its job, so
 * they map onto the same statuses a chain read would have produced. Anything else is a real error.
 */
export function payStatusFromError(err: unknown): "already-paid" | "conflict" | undefined {
  switch (revertName(err)) {
    case "AlreadyPaid":
      return "already-paid";
    case "SettlementConflict":
      return "conflict";
    default:
      return undefined;
  }
}

/** One sentence that says what happened and what it means for the invoice. */
export function explainError(err: unknown): string {
  const name = revertName(err);
  const args = revertArgs(err);
  switch (name) {
    case "AlreadyPaid":
      return `Blocked by SettleOnce: this invoice was already paid from this wallet in block ${String(args[2])}.`;
    case "SettlementConflict":
      return `Blocked by SettleOnce: this invoice key is already settled with different details (${String(
        args[3],
      )} base units to ${String(args[2])}).`;
    case "InvalidRecipient":
      return "That recipient can't receive payments. Use a wallet address.";
    case "ZeroAmount":
      return "Amount must be more than 0.";
    case "ZeroInvoiceKey":
      return "This invoice has no references, so it has no key.";
    case "AmountTooLarge":
      return "That amount is too large for one settlement.";
    case "TransferFailed":
      return "USDC refused the transfer. The invoice is still unpaid.";
    case "Reentrancy":
      return "The contract refused a reentrant call. Nothing was paid.";
    default:
      break;
  }
  if (err instanceof BaseError) return err.shortMessage || err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

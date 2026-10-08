import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { formatUsdc } from "./usdc";

/** Turn wallet / RPC / contract errors into one sentence that says what happened and what to do. */
export function explainError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You rejected the request in your wallet. Nothing was sent.";
    }
    if (err.walk((e) => e instanceof WaitForTransactionReceiptTimeoutError)) {
      return "The network hasn't confirmed this yet. Don't pay again: refresh the invoice status first.";
    }
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      const args = revert.data?.args ?? [];
      switch (name) {
        case "AlreadyPaid":
          return `Blocked by SettleOnce: this invoice was already paid from this wallet in block ${String(args[2])}.`;
        case "SettlementConflict":
          return `Blocked by SettleOnce: this invoice was already paid with different details (${formatUsdc(
            BigInt(String(args[3] ?? 0)),
          )} USDC to ${String(args[2])}).`;
        case "InvalidRecipient":
          return "That recipient can't receive payments. Use a wallet address.";
        case "ZeroAmount":
          return "Amount must be more than 0.";
        case "ZeroInvoiceKey":
          return "This invoice has no reference.";
        case "TransferFailed":
          return "USDC refused the transfer. The invoice is still unpaid.";
        default:
          if (revert.reason) return `USDC refused the transfer: ${revert.reason}. The invoice is still unpaid.`;
      }
    }
    if (/insufficient funds/i.test(err.message)) {
      return "Not enough USDC to cover the amount plus gas. Top up this wallet and try again.";
    }
    return err.shortMessage || err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
}

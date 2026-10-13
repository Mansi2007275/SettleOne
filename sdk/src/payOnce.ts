import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { erc20Abi, settleOnceAbi } from "./abi.ts";
import { floorMaxFee, parseUsdcAmount, requireAddress } from "./amount.ts";
import { MIN_MAX_FEE_PER_GAS, USDC_ADDRESS } from "./chains.ts";
import { SettleOnceError, explainError, payStatusFromError } from "./errors.ts";
import { checkRef, deriveInvoiceKey } from "./invoiceKey.ts";
import { decidePayAction, getSettlement, type SettleOnceReceipt } from "./settlement.ts";

export type PayOnceInput = {
  /** The SettleOnce deployment to pay through. */
  contract: Address | string;
  vendorRef: string;
  invoiceRef: string;
  recipient: Address | string;
  /** Human USDC amount: "0.02" or 0.02. Converted to 6-decimal base units, strictly. */
  amountUsdc: string | number;
  /** Arc's USDC ERC-20 interface. Only worth setting against a local fork. */
  usdc?: Address;
  /**
   * Called as soon as the payment transaction is broadcast, before it is confirmed. This is the
   * dangerous moment a crash can happen in, so it is the moment an agent can hook into.
   */
  onSent?: (info: { txHash: Hex; invoiceKey: Hex }) => void | Promise<void>;
  /** Confirmations to wait for. Arc has deterministic sub-second finality, so 1 is enough. */
  confirmations?: number;
  /** Receipt wait timeout in ms. On a timeout nothing is retried: re-read the chain instead. */
  timeout?: number;
};

export type PayOnceResult =
  /** Sent and confirmed in this run. */
  | { status: "paid"; invoiceKey: Hex; txHash: Hex; receipt: SettleOnceReceipt }
  /** The chain already holds this exact payment. Nothing was sent. */
  | { status: "already-paid"; invoiceKey: Hex; receipt: SettleOnceReceipt }
  /** The key is settled with a different recipient or amount. Nothing was sent. */
  | { status: "conflict"; invoiceKey: Hex; receipt: SettleOnceReceipt };

/**
 * Pay one invoice, at most once.
 *
 *   1. Derive the invoice key from the two business references.
 *   2. Ask the chain first. Already paid with these details -> "already-paid"; already paid with
 *      different details -> "conflict". Neither case sends anything.
 *   3. Approve exactly the invoice amount, only if the current allowance is short.
 *   4. Simulate, send `payOnce`, wait for the receipt, read the settlement back.
 *
 * The guard lives in the contract, not here: `AlreadyPaid` and `SettlementConflict` reverts are
 * mapped onto the same two statuses, so a race between two agents ends as a status, not a crash,
 * and never as a second payment. Rerunning this function after a crash is always safe.
 */
export async function payOnce(
  walletClient: WalletClient,
  publicClient: PublicClient,
  input: PayOnceInput,
): Promise<PayOnceResult> {
  const account = walletClient.account;
  if (!account) {
    throw new SettleOnceError("no-account", "The wallet client has no account. Create it with an account to pay.");
  }
  const payer = account.address;

  for (const [value, label] of [
    [input.vendorRef, "Vendor reference"],
    [input.invoiceRef, "Invoice number"],
  ] as const) {
    const problem = checkRef(value, label);
    if (problem) throw new SettleOnceError("invalid-reference", problem);
  }

  const contract = requireAddress(String(input.contract), "SettleOnce address");
  const recipient = requireAddress(String(input.recipient), "Recipient");
  const usdc = requireAddress(String(input.usdc ?? USDC_ADDRESS), "USDC address");
  if (recipient.toLowerCase() === usdc.toLowerCase() || recipient.toLowerCase() === contract.toLowerCase()) {
    throw new SettleOnceError("invalid-address", "Recipient is a contract address, not a wallet.");
  }
  const amount = parseUsdcAmount(input.amountUsdc);
  const invoiceKey = deriveInvoiceKey(input.vendorRef, input.invoiceRef);

  // The chain, before anything is signed.
  const before = await getSettlement(publicClient, { contract, payer, key: invoiceKey });
  const action = decidePayAction({ receipt: before, recipient, amount });
  if (action !== "pay") return { status: action, invoiceKey, receipt: before };

  const fees = floorMaxFee(await estimateFees(publicClient), MIN_MAX_FEE_PER_GAS);
  const chain = walletClient.chain ?? null;

  const allowance = await publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [payer, contract],
  });

  if (allowance < amount) {
    // Exactly this invoice, never an unlimited approval: a leftover allowance is a liability.
    const approveHash = await walletClient.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [contract, amount],
      account,
      chain,
      ...fees,
    });
    const approval = await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: input.timeout });
    if (approval.status !== "success") {
      throw new SettleOnceError("reverted", "The USDC approval was reverted on chain. Nothing was paid.");
    }
  }

  let txHash: Hex;
  try {
    // Simulated from the payer account, so a duplicate or a conflict costs no gas at all.
    await publicClient.simulateContract({
      address: contract,
      abi: settleOnceAbi,
      functionName: "payOnce",
      args: [invoiceKey, recipient, amount],
      account,
    });
    txHash = await walletClient.writeContract({
      address: contract,
      abi: settleOnceAbi,
      functionName: "payOnce",
      args: [invoiceKey, recipient, amount],
      account,
      chain,
      ...fees,
    });
  } catch (err) {
    const status = payStatusFromError(err);
    if (status) {
      // The contract turned it away: report what the chain holds, not what we tried to send.
      return { status, invoiceKey, receipt: await getSettlement(publicClient, { contract, payer, key: invoiceKey }) };
    }
    throw new SettleOnceError("reverted", explainError(err), { cause: err });
  }

  await input.onSent?.({ txHash, invoiceKey });

  const txReceipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: input.confirmations ?? 1,
    timeout: input.timeout,
  });

  // Whatever the receipt says, the settlement itself is the answer.
  const after = await getSettlement(publicClient, { contract, payer, key: invoiceKey });
  if (txReceipt.status !== "success") {
    const settled = decidePayAction({ receipt: after, recipient, amount });
    if (settled !== "pay") return { status: settled, invoiceKey, receipt: after };
    throw new SettleOnceError("reverted", "The payment was reverted on chain. The invoice is still unpaid.");
  }

  return { status: "paid", invoiceKey, txHash, receipt: after };
}

/** Fee estimate, or nothing: an RPC that can't estimate still gets Arc's floor applied. */
async function estimateFees(
  publicClient: PublicClient,
): Promise<{ maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } | undefined> {
  try {
    return await publicClient.estimateFeesPerGas();
  } catch {
    return undefined;
  }
}

/**
 * settleonce-sdk — pay a USDC invoice on Arc at most once, from any app or AI agent.
 *
 *   const { publicClient, walletClient } = createArcClients({ network: "testnet", privateKey });
 *   const result = await payOnce(walletClient, publicClient, {
 *     contract: "0x…", vendorRef: "VENDOR-7", invoiceRef: "INV-1042",
 *     recipient: "0x…", amountUsdc: "0.02",
 *   });
 *   // result.status: "paid" | "already-paid" | "conflict"
 *
 * Rerunning a payment is safe by construction: the key comes from the invoice's own references,
 * the chain is read before anything is signed, and the contract refuses a second settlement.
 */
export { erc20Abi, settleOnceAbi } from "./abi.ts";
export { formatUsdcAmount, floorMaxFee, parseUsdcAmount, requireAddress } from "./amount.ts";
export {
  CHAINS,
  MIN_MAX_FEE_PER_GAS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  addressUrl,
  arcChain,
  arcMainnet,
  arcTestnet,
  blockUrl,
  explorerUrl,
  txUrl,
  type ArcNetwork,
} from "./chains.ts";
export { createArcClients, type ArcClients } from "./clients.ts";
export {
  SettleOnceError,
  explainError,
  payStatusFromError,
  revertArgs,
  revertName,
  type SettleOnceErrorCode,
} from "./errors.ts";
export { KEY_NAMESPACE, MAX_REF_LENGTH, checkRef, deriveInvoiceKey, normalizeRef } from "./invoiceKey.ts";
export { payOnce, type PayOnceInput, type PayOnceResult } from "./payOnce.ts";
export {
  decidePayAction,
  getSettlement,
  getSettlements,
  toReceipt,
  type PayAction,
  type SettleOnceReceipt,
  type Settlement,
} from "./settlement.ts";

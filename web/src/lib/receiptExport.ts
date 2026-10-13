import type { Address, Hex } from "viem";
import { deriveInvoiceKey, normalizeRef } from "./invoice";
import type { Settlement } from "./settlement";
import { formatUsdcPlain } from "./usdc";

/**
 * A settled receipt, turned into something the payer can keep off-chain.
 *
 * Everything here comes from the contract read that drew the page; nothing is invented and
 * nothing is rounded. Amounts travel as strings (`amountUnits` is the exact 6-decimal base-unit
 * integer) because JSON has no bigint, and block numbers travel as strings for the same reason.
 *
 * The two business references are the one thing on the page that the *URL* supplies rather than
 * the chain, so they are only written out when `keccak256(abi.encode(ns, vendorRef, invoiceRef))`
 * reproduces the invoice key. A pair that doesn't match is left out of the file entirely: the
 * export must never let a wrong reference ride along on a real settlement.
 */
export const RECEIPT_EXPORT_SCHEMA = "settleonce.receipt.v1";

export type ReceiptExportFacts = {
  /** "testnet" | "mainnet", as configured for the app. */
  network: string;
  chainName: string;
  chainId: number;
  contract: Address;
  payer: Address;
  invoiceKey: Hex;
  /** References from the receipt URL, or null when the link carried none. */
  claimedRefs: { vendorRef: string; invoiceRef: string } | null;
  settlement: Settlement;
  /** The transaction that settled it, or null when the log couldn't be read. */
  txHash: Hex | null;
  /** Explorer origin, no trailing slash, e.g. "https://explorer.testnet.arc.io". */
  explorerUrl: string;
  /** Absolute URL of this receipt page. */
  receiptUrl: string;
  generatedAt: Date;
};

export type ReceiptExport = {
  schema: typeof RECEIPT_EXPORT_SCHEMA;
  network: string;
  chainName: string;
  chainId: number;
  contract: Address;
  payer: Address;
  invoiceKey: Hex;
  /** Present only when the references derive this exact key. */
  vendorRef?: string;
  invoiceRef?: string;
  recipient: Address;
  amountUsdc: string;
  amountUnits: string;
  paidAtBlock: string;
  paidAtIso: string;
  txHash: Hex | null;
  receiptUrl: string;
  links: {
    contract: string;
    payer: string;
    recipient: string;
    block: string;
    /** null when there is no transaction hash to link to. */
    tx: string | null;
  };
  generatedAt: string;
};

export function buildReceiptExport(facts: ReceiptExportFacts): ReceiptExport {
  const { settlement: s, explorerUrl: base, claimedRefs } = facts;
  if (s.paidAtBlock === 0n) throw new Error("buildReceiptExport needs a settled receipt");

  const refs = refsMatchingKey(claimedRefs, facts.invoiceKey);

  return {
    schema: RECEIPT_EXPORT_SCHEMA,
    network: facts.network,
    chainName: facts.chainName,
    chainId: facts.chainId,
    contract: facts.contract,
    payer: facts.payer,
    invoiceKey: facts.invoiceKey,
    ...(refs ?? {}),
    recipient: s.recipient,
    amountUsdc: formatUsdcPlain(s.amount),
    amountUnits: s.amount.toString(),
    paidAtBlock: s.paidAtBlock.toString(),
    paidAtIso: isoFromSeconds(s.paidAt),
    txHash: facts.txHash,
    receiptUrl: facts.receiptUrl,
    links: {
      contract: `${base}/address/${facts.contract}`,
      payer: `${base}/address/${facts.payer}`,
      recipient: `${base}/address/${s.recipient}`,
      block: `${base}/block/${s.paidAtBlock.toString()}`,
      tx: facts.txHash ? `${base}/tx/${facts.txHash}` : null,
    },
    generatedAt: facts.generatedAt.toISOString(),
  };
}

/** The normalized references, but only when they really do derive this key. */
export function refsMatchingKey(
  claimedRefs: { vendorRef: string; invoiceRef: string } | null,
  invoiceKey: Hex,
): { vendorRef: string; invoiceRef: string } | null {
  if (!claimedRefs) return null;
  const { vendorRef, invoiceRef } = claimedRefs;
  if (deriveInvoiceKey(vendorRef, invoiceRef).toLowerCase() !== invoiceKey.toLowerCase()) return null;
  return { vendorRef: normalizeRef(vendorRef), invoiceRef: normalizeRef(invoiceRef) };
}

/**
 * The public receipt link, carrying the two references so the page can confirm they really do
 * derive the key it is showing. This is the link the QR code encodes and the desk copies, so it
 * is built in one place.
 */
export function receiptPath(
  payer: Address,
  invoiceKey: Hex,
  refs: { vendorRef: string; invoiceRef: string } | null,
): string {
  const base = `/receipt/${payer}/${invoiceKey}`;
  if (!refs) return base;
  return `${base}?v=${encodeURIComponent(refs.vendorRef)}&i=${encodeURIComponent(refs.invoiceRef)}`;
}

/** Pretty-printed, newline-terminated, so the file reads well in an editor. */
export function receiptJsonText(receipt: ReceiptExport): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

/**
 * `settleonce-receipt-<invoiceRef or short key>-<block>`, without an extension.
 *
 * The invoice number is only used when it was verified against the key; otherwise the key's own
 * first bytes name the file, which is always unambiguous.
 */
export function receiptFileBase(receipt: ReceiptExport): string {
  const slug = receipt.invoiceRef ? slugify(receipt.invoiceRef) : "";
  const label = slug || receipt.invoiceKey.slice(0, 10).toLowerCase();
  return `settleonce-receipt-${label}-${receipt.paidAtBlock}`;
}

/** The receipt's own lines, in the order the slip shows them, for the PDF. */
export function receiptPdfLines(receipt: ReceiptExport): { label: string; value: string }[] {
  return [
    { label: "Invoice key", value: receipt.invoiceKey },
    { label: "Payer", value: receipt.payer },
    { label: "Paid to", value: receipt.recipient },
    { label: "Amount", value: `${receipt.amountUsdc} USDC` },
    { label: "Block", value: receipt.paidAtBlock },
    { label: "Time (UTC)", value: receipt.paidAtIso },
    { label: "Transaction", value: receipt.txHash ?? "not found in that block" },
    { label: "Contract", value: receipt.contract },
    { label: "Network", value: `${receipt.chainName} (chain ${receipt.chainId})` },
  ];
}

/** "ACME / INV-1042", or null when the references weren't verified. */
export function receiptRefLine(receipt: ReceiptExport): string | null {
  return receipt.vendorRef && receipt.invoiceRef ? `${receipt.vendorRef} / ${receipt.invoiceRef}` : null;
}

/** Lower-case, filename-safe, never empty-ish punctuation: "INV 10/42" -> "inv-10-42". */
function slugify(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function isoFromSeconds(seconds: bigint): string {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms)) throw new Error(`settlement timestamp ${seconds} is out of range`);
  return new Date(ms).toISOString();
}

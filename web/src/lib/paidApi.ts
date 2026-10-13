import { getAddress, isAddress, type Address, type Hex } from "viem";
import { deriveInvoiceKey, normalizeRef, MAX_REF_LENGTH } from "./invoice";
import { receiptPath } from "./receiptExport";
import type { Settlement } from "./settlement";
import { formatUsdcPlain } from "./usdc";

/**
 * GET /api/paid?payer=&vendor=&invoice=
 *
 * "Has this wallet paid this invoice?" for anything that speaks HTTP: an accounting system, a
 * vendor's portal, a shell script, an agent with no wallet. The answer comes from one contract
 * read; there is no database to be stale and no cache to serve a wrong "paid".
 *
 * This file holds the pure halves — reading the query and shaping the body — so both can be
 * tested without a chain or a server.
 */

export type PaidQuery = {
  payer: Address;
  vendorRef: string;
  invoiceRef: string;
  invoiceKey: Hex;
};

export type PaidQueryResult = { ok: true; query: PaidQuery } | { ok: false; error: string };

/** The exact JSON this endpoint answers with. Unpaid invoices report nulls, never zeros. */
export type PaidBody = {
  paid: boolean;
  recipient: Address | null;
  /** Plain decimal USDC, e.g. "0.02". Null while unpaid. */
  amountUsdc: string | null;
  paidAtBlock: string | null;
  invoiceKey: Hex;
  receiptUrl: string;
};

/**
 * Read and validate the three parameters. Anything missing or malformed is a 400 with a sentence
 * that says which parameter was wrong — never a guess, and never a silent "not paid".
 */
export function parsePaidQuery(params: {
  payer?: string | null;
  vendor?: string | null;
  invoice?: string | null;
}): PaidQueryResult {
  const payerRaw = (params.payer ?? "").trim();
  if (!payerRaw) return { ok: false, error: "payer is required: the wallet that paid." };
  if (!isAddress(payerRaw, { strict: false })) return { ok: false, error: `payer "${payerRaw}" is not a 0x address.` };

  const vendorRef = normalizeRef(params.vendor ?? "");
  if (!vendorRef) return { ok: false, error: "vendor is required: the vendor reference on the invoice." };
  if (vendorRef.length > MAX_REF_LENGTH) {
    return { ok: false, error: `vendor must be ${MAX_REF_LENGTH} characters or fewer.` };
  }

  const invoiceRef = normalizeRef(params.invoice ?? "");
  if (!invoiceRef) return { ok: false, error: "invoice is required: the invoice number." };
  if (invoiceRef.length > MAX_REF_LENGTH) {
    return { ok: false, error: `invoice must be ${MAX_REF_LENGTH} characters or fewer.` };
  }

  return {
    ok: true,
    query: {
      payer: getAddress(payerRaw),
      vendorRef,
      invoiceRef,
      invoiceKey: deriveInvoiceKey(vendorRef, invoiceRef),
    },
  };
}

/**
 * Shape the answer. The settlement comes from the contract: `paidAtBlock === 0n` is the only
 * thing that means unpaid, and the amount is printed from the base units the contract stores.
 *
 * `paidAtBlock` is a string because JSON has no 64-bit integers, and a block number is not
 * something to risk rounding.
 */
export function paidBody({
  query,
  settlement,
  origin,
}: {
  query: PaidQuery;
  settlement: Settlement;
  /** Absolute origin of this deployment, so the receipt link can be opened as it stands. */
  origin: string;
}): PaidBody {
  const paid = settlement.paidAtBlock !== 0n;
  const path = receiptPath(query.payer, query.invoiceKey, {
    vendorRef: query.vendorRef,
    invoiceRef: query.invoiceRef,
  });

  return {
    paid,
    recipient: paid ? getAddress(settlement.recipient) : null,
    amountUsdc: paid ? formatUsdcPlain(settlement.amount) : null,
    paidAtBlock: paid ? settlement.paidAtBlock.toString() : null,
    invoiceKey: query.invoiceKey,
    receiptUrl: `${origin.replace(/\/+$/, "")}${path}`,
  };
}

/**
 * The origin to build the receipt link from. Behind a proxy the request URL is the internal one,
 * so the forwarded headers win when they are there.
 */
export function originFromRequest(url: string, headers: { get: (name: string) => string | null }): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

import { getAddress, type Address, type Hex } from "viem";
import { shortHex } from "./explorer";
import { normalizeRef } from "./invoice";

/**
 * Wallet-change guard.
 *
 * The commonest invoice fraud is not a forged invoice: it is a real vendor's invoice with the
 * payment details quietly swapped, so a legitimate-looking bill pays a stranger. SettleOnce's key
 * deliberately ignores the recipient — otherwise editing it would mint a "new" invoice and walk
 * past the duplicate guard — which means the contract cannot catch this. This file does, on the
 * desk, before anything is signed.
 *
 * It remembers one thing per vendor: the wallet the chain says that vendor was last paid at. If a
 * new invoice for a known vendor points somewhere else, the ticket says so and the Pay button is
 * held until the reader confirms the new wallet with the vendor out of band.
 *
 * Everything here is pure. The memory is only ever written from a settlement the contract
 * confirmed, never from an unpaid row on the desk.
 */

export const MAX_VENDORS = 100;
export const MAX_CONFIRMATIONS = 200;

export type VendorMemory = {
  /** The wallet this vendor was paid at, checksummed. */
  recipient: Address;
  /** Block of that settlement: newer settlements win, replays of older ones don't. */
  lastPaidBlock: bigint;
};

/** Keyed by normalized vendor reference, so "acme corp" and "ACME  CORP" are one vendor. */
export type VendorBook = Record<string, VendorMemory>;

export type PaidVendor = {
  vendorRef: string;
  /** The recipient the *contract* recorded, not the one on the desk row. */
  recipient: Address;
  paidAtBlock: bigint;
};

/**
 * Record one confirmed settlement. Returns the same object when nothing changed, so a caller can
 * use identity to decide whether to write to storage.
 *
 * At most `MAX_VENDORS` vendors are kept; when the book is full the vendor whose last payment is
 * oldest is dropped, because the newest payments are the ones a reader can still remember.
 */
export function rememberPaidVendor(book: VendorBook, paid: PaidVendor): VendorBook {
  const vendorRef = normalizeRef(paid.vendorRef);
  if (!vendorRef || paid.paidAtBlock <= 0n) return book;

  const recipient = getAddress(paid.recipient);
  const existing = book[vendorRef];
  if (existing) {
    // An older settlement never overwrites a newer one, whatever order the rows arrive in.
    if (existing.lastPaidBlock > paid.paidAtBlock) return book;
    if (existing.recipient === recipient && existing.lastPaidBlock === paid.paidAtBlock) return book;
  }

  const next: VendorBook = { ...book, [vendorRef]: { recipient, lastPaidBlock: paid.paidAtBlock } };
  return prune(next);
}

export function rememberPaidVendors(book: VendorBook, rows: readonly PaidVendor[]): VendorBook {
  let next = book;
  for (const row of rows) next = rememberPaidVendor(next, row);
  return next;
}

function prune(book: VendorBook): VendorBook {
  const entries = Object.entries(book);
  if (entries.length <= MAX_VENDORS) return book;
  entries.sort((a, b) => (a[1].lastPaidBlock > b[1].lastPaidBlock ? -1 : a[1].lastPaidBlock < b[1].lastPaidBlock ? 1 : 0));
  return Object.fromEntries(entries.slice(0, MAX_VENDORS));
}

/* ------------------------------------------------------------------ warnings */

export type GuardRow = {
  key: Hex;
  vendorRef: string;
  recipient: Address;
  /** True when the contract already settled this row: there is no payment left to hold back. */
  paid: boolean;
};

export type WalletWarning = {
  invoiceKey: Hex;
  vendorRef: string;
  /** `history`: this vendor was paid elsewhere before. `desk`: two wallets for one vendor, here. */
  kind: "history" | "desk";
  /** The wallet this invoice wants to pay. */
  recipient: Address;
  /** The wallet(s) this vendor is known at: the remembered one, or the others on the desk. */
  known: Address[];
  /** The reader has ticked "I confirmed this wallet with the vendor" for this invoice key. */
  confirmed: boolean;
};

/**
 * Warnings for the desk, keyed by invoice key.
 *
 * Two independent checks:
 *   - **history** — a remembered vendor now points at a different wallet.
 *   - **desk** — one vendor reference carries two different wallets on this desk at once. Both
 *     tickets are warned: from the outside there is no way to tell which one is the impostor.
 *
 * Paid rows are never warned (nothing left to stop) but they do count as known wallets, so a
 * clash between a settled row and a new one still surfaces.
 */
export function walletWarnings({
  rows,
  book,
  confirmedKeys = [],
}: {
  rows: readonly GuardRow[];
  book: VendorBook;
  confirmedKeys?: readonly Hex[];
}): Map<Hex, WalletWarning> {
  const confirmed = new Set(confirmedKeys.map((key) => key.toLowerCase()));
  const warnings = new Map<Hex, WalletWarning>();

  // Every wallet each vendor appears at on this desk, in row order and without duplicates.
  const onDesk = new Map<string, Address[]>();
  for (const row of rows) {
    const vendorRef = normalizeRef(row.vendorRef);
    if (!vendorRef) continue;
    const seen = onDesk.get(vendorRef) ?? [];
    if (!seen.some((address) => sameAddress(address, row.recipient))) seen.push(getAddress(row.recipient));
    onDesk.set(vendorRef, seen);
  }

  for (const row of rows) {
    if (row.paid) continue;
    const vendorRef = normalizeRef(row.vendorRef);
    if (!vendorRef) continue;
    const recipient = getAddress(row.recipient);
    const isConfirmed = confirmed.has(row.key.toLowerCase());

    const remembered = book[vendorRef];
    if (remembered && !sameAddress(remembered.recipient, recipient)) {
      warnings.set(row.key, {
        invoiceKey: row.key,
        vendorRef,
        kind: "history",
        recipient,
        known: [remembered.recipient],
        confirmed: isConfirmed,
      });
      continue;
    }

    const others = (onDesk.get(vendorRef) ?? []).filter((address) => !sameAddress(address, recipient));
    if (others.length > 0) {
      warnings.set(row.key, {
        invoiceKey: row.key,
        vendorRef,
        kind: "desk",
        recipient,
        known: others,
        confirmed: isConfirmed,
      });
    }
  }

  return warnings;
}

/** True when this invoice must not be paid yet: warned and not confirmed by the reader. */
export function isPayBlocked(warning: WalletWarning | undefined | null): boolean {
  return !!warning && !warning.confirmed;
}

/** The sentence on the ticket. Addresses are shortened the same way as everywhere else. */
export function warningMessage(warning: WalletWarning): string {
  if (warning.kind === "history") {
    return (
      `${warning.vendorRef} was paid to ${shortHex(warning.known[0]!)} before. ` +
      `This invoice uses ${shortHex(warning.recipient)}. ` +
      `Confirm the new wallet with the vendor before paying.`
    );
  }
  const others = warning.known.map((address) => shortHex(address)).join(", ");
  return (
    `${warning.vendorRef} appears on this desk with more than one wallet: this invoice uses ` +
    `${shortHex(warning.recipient)}, another uses ${others}. ` +
    `Confirm the right wallet with the vendor before paying.`
  );
}

/** Add an invoice key to the confirmed list, newest last, capped. */
export function rememberConfirmation(keys: readonly Hex[], key: Hex): Hex[] {
  const without = keys.filter((existing) => existing.toLowerCase() !== key.toLowerCase());
  const next = [...without, key];
  return next.length > MAX_CONFIRMATIONS ? next.slice(next.length - MAX_CONFIRMATIONS) : next;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

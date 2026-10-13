import { getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { deriveInvoiceKey } from "./invoice";
import {
  MAX_CONFIRMATIONS,
  MAX_VENDORS,
  isPayBlocked,
  rememberConfirmation,
  rememberPaidVendor,
  rememberPaidVendors,
  walletWarnings,
  warningMessage,
  type GuardRow,
  type VendorBook,
} from "./walletGuard";

const GOOD = getAddress("0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF");
const THIEF = getAddress("0x5B38Da6a701c568545dCfcB03FcB875f56beddC4");
const THIRD = getAddress("0x1111111111111111111111111111111111111111");

const row = (vendorRef: string, invoiceRef: string, recipient: Address, paid = false): GuardRow => ({
  key: deriveInvoiceKey(vendorRef, invoiceRef),
  vendorRef,
  recipient,
  paid,
});

describe("rememberPaidVendor", () => {
  it("records the wallet a vendor was paid at", () => {
    const book = rememberPaidVendor({}, { vendorRef: "ACME", recipient: GOOD, paidAtBlock: 100n });
    expect(book).toEqual({ ACME: { recipient: GOOD, lastPaidBlock: 100n } });
  });

  it("keys the memory by the normalized reference", () => {
    const book = rememberPaidVendor({}, { vendorRef: "  acme   corp ", recipient: GOOD, paidAtBlock: 1n });
    expect(Object.keys(book)).toEqual(["ACME CORP"]);
  });

  it("checksums the address it was handed", () => {
    const book = rememberPaidVendor({}, { vendorRef: "ACME", recipient: GOOD.toLowerCase() as Address, paidAtBlock: 1n });
    expect(book.ACME!.recipient).toBe(GOOD);
  });

  it("moves a vendor to a new wallet once a newer settlement says so", () => {
    let book = rememberPaidVendor({}, { vendorRef: "ACME", recipient: GOOD, paidAtBlock: 100n });
    book = rememberPaidVendor(book, { vendorRef: "ACME", recipient: THIEF, paidAtBlock: 200n });
    expect(book.ACME).toEqual({ recipient: THIEF, lastPaidBlock: 200n });
  });

  it("ignores an older settlement arriving after a newer one", () => {
    const book = rememberPaidVendor({}, { vendorRef: "ACME", recipient: THIEF, paidAtBlock: 200n });
    const after = rememberPaidVendor(book, { vendorRef: "ACME", recipient: GOOD, paidAtBlock: 100n });
    expect(after).toBe(book);
    expect(after.ACME!.recipient).toBe(THIEF);
  });

  it("returns the same book when nothing changed, so storage is not rewritten", () => {
    const book = rememberPaidVendor({}, { vendorRef: "ACME", recipient: GOOD, paidAtBlock: 100n });
    expect(rememberPaidVendor(book, { vendorRef: "ACME", recipient: GOOD, paidAtBlock: 100n })).toBe(book);
    expect(rememberPaidVendor(book, { vendorRef: "acme", recipient: GOOD.toLowerCase() as Address, paidAtBlock: 100n })).toBe(
      book,
    );
  });

  it("never records an unsettled row: block 0 is not a payment", () => {
    expect(rememberPaidVendor({}, { vendorRef: "ACME", recipient: GOOD, paidAtBlock: 0n })).toEqual({});
  });

  it("ignores a vendor reference that normalizes to nothing", () => {
    expect(rememberPaidVendor({}, { vendorRef: "   ", recipient: GOOD, paidAtBlock: 5n })).toEqual({});
  });

  it("does not mutate the book it was given", () => {
    const book: VendorBook = { ACME: { recipient: GOOD, lastPaidBlock: 1n } };
    rememberPaidVendor(book, { vendorRef: "OTHER", recipient: THIEF, paidAtBlock: 2n });
    expect(Object.keys(book)).toEqual(["ACME"]);
  });

  it(`keeps at most ${MAX_VENDORS} vendors, dropping the oldest payment`, () => {
    let book: VendorBook = {};
    for (let i = 1; i <= MAX_VENDORS + 5; i++) {
      book = rememberPaidVendor(book, { vendorRef: `V-${i}`, recipient: GOOD, paidAtBlock: BigInt(i) });
    }
    const keys = Object.keys(book);
    expect(keys).toHaveLength(MAX_VENDORS);
    // The five oldest are gone; the newest is still there.
    expect(keys).not.toContain("V-1");
    expect(keys).not.toContain("V-5");
    expect(keys).toContain("V-6");
    expect(keys).toContain(`V-${MAX_VENDORS + 5}`);
  });

  it("folds a whole desk's settlements in one pass", () => {
    const book = rememberPaidVendors({}, [
      { vendorRef: "ACME", recipient: GOOD, paidAtBlock: 10n },
      { vendorRef: "NORTH", recipient: THIEF, paidAtBlock: 11n },
      { vendorRef: "ACME", recipient: THIRD, paidAtBlock: 12n },
    ]);
    expect(book.ACME).toEqual({ recipient: THIRD, lastPaidBlock: 12n });
    expect(book.NORTH).toEqual({ recipient: THIEF, lastPaidBlock: 11n });
  });
});

describe("walletWarnings: a vendor's wallet changed since last time", () => {
  const book: VendorBook = { ACME: { recipient: GOOD, lastPaidBlock: 100n } };

  it("says nothing when the wallet is the one it remembers", () => {
    expect(walletWarnings({ rows: [row("ACME", "INV-2", GOOD)], book }).size).toBe(0);
  });

  it("ignores address casing, so a re-typed invoice is not a false alarm", () => {
    const rows = [row("ACME", "INV-2", GOOD.toLowerCase() as Address)];
    expect(walletWarnings({ rows, book }).size).toBe(0);
  });

  it("warns when a known vendor points somewhere else", () => {
    const invoice = row("ACME", "INV-2", THIEF);
    const warning = walletWarnings({ rows: [invoice], book }).get(invoice.key)!;
    expect(warning).toMatchObject({
      kind: "history",
      vendorRef: "ACME",
      recipient: THIEF,
      known: [GOOD],
      confirmed: false,
    });
  });

  it("matches the vendor however the reference was typed", () => {
    const invoice = row("  acme ", "INV-2", THIEF);
    expect(walletWarnings({ rows: [invoice], book }).get(invoice.key)?.kind).toBe("history");
  });

  it("says nothing about a vendor it has never paid", () => {
    expect(walletWarnings({ rows: [row("BRAND-NEW", "INV-1", THIEF)], book }).size).toBe(0);
  });

  it("does not warn on a row the contract already settled", () => {
    expect(walletWarnings({ rows: [row("ACME", "INV-2", THIEF, true)], book }).size).toBe(0);
  });

  it("marks the warning confirmed once the reader has ticked that invoice", () => {
    const invoice = row("ACME", "INV-2", THIEF);
    const warning = walletWarnings({ rows: [invoice], book, confirmedKeys: [invoice.key] }).get(invoice.key)!;
    expect(warning.confirmed).toBe(true);
    expect(isPayBlocked(warning)).toBe(false);
  });

  it("confirms by key only: another invoice from the same vendor is still held", () => {
    const confirmed = row("ACME", "INV-2", THIEF);
    const other = row("ACME", "INV-3", THIEF);
    const warnings = walletWarnings({ rows: [confirmed, other], book, confirmedKeys: [confirmed.key] });
    expect(warnings.get(confirmed.key)!.confirmed).toBe(true);
    expect(warnings.get(other.key)!.confirmed).toBe(false);
  });

  it("matches a confirmation stored in a different case", () => {
    const invoice = row("ACME", "INV-2", THIEF);
    const upper = invoice.key.toUpperCase().replace("0X", "0x") as Hex;
    expect(walletWarnings({ rows: [invoice], book, confirmedKeys: [upper] }).get(invoice.key)!.confirmed).toBe(true);
  });
});

describe("walletWarnings: two wallets for one vendor on the same desk", () => {
  it("warns on both tickets", () => {
    const a = row("ACME", "INV-1", GOOD);
    const b = row("ACME", "INV-2", THIEF);
    const warnings = walletWarnings({ rows: [a, b], book: {} });
    expect(warnings.size).toBe(2);
    expect(warnings.get(a.key)).toMatchObject({ kind: "desk", recipient: GOOD, known: [THIEF] });
    expect(warnings.get(b.key)).toMatchObject({ kind: "desk", recipient: THIEF, known: [GOOD] });
  });

  it("lists every other wallet when a vendor appears three times", () => {
    const a = row("ACME", "INV-1", GOOD);
    const warnings = walletWarnings({
      rows: [a, row("ACME", "INV-2", THIEF), row("ACME", "INV-3", THIRD)],
      book: {},
    });
    expect(warnings.get(a.key)!.known).toEqual([THIEF, THIRD]);
  });

  it("says nothing when one vendor has several invoices to the same wallet", () => {
    const rows = [row("ACME", "INV-1", GOOD), row("ACME", "INV-2", GOOD), row("ACME", "INV-3", GOOD)];
    expect(walletWarnings({ rows, book: {} }).size).toBe(0);
  });

  it("keeps different vendors to themselves", () => {
    const rows = [row("ACME", "INV-1", GOOD), row("NORTH", "NW-1", THIEF)];
    expect(walletWarnings({ rows, book: {} }).size).toBe(0);
  });

  it("warns the unpaid row when the clash is with a settled one", () => {
    const settled = row("ACME", "INV-1", GOOD, true);
    const fresh = row("ACME", "INV-2", THIEF);
    const warnings = walletWarnings({ rows: [settled, fresh], book: {} });
    expect(warnings.has(settled.key)).toBe(false);
    expect(warnings.get(fresh.key)).toMatchObject({ kind: "desk", known: [GOOD] });
  });

  it("prefers the history warning when both checks fire", () => {
    const book: VendorBook = { ACME: { recipient: GOOD, lastPaidBlock: 9n } };
    const a = row("ACME", "INV-1", THIEF);
    const b = row("ACME", "INV-2", THIRD);
    const warnings = walletWarnings({ rows: [a, b], book });
    expect(warnings.get(a.key)!.kind).toBe("history");
    expect(warnings.get(a.key)!.known).toEqual([GOOD]);
    expect(warnings.get(b.key)!.kind).toBe("history");
  });
});

describe("isPayBlocked", () => {
  it("blocks an unconfirmed warning and nothing else", () => {
    const invoice = row("ACME", "INV-2", THIEF);
    const book: VendorBook = { ACME: { recipient: GOOD, lastPaidBlock: 1n } };
    expect(isPayBlocked(walletWarnings({ rows: [invoice], book }).get(invoice.key))).toBe(true);
    expect(isPayBlocked(undefined)).toBe(false);
    expect(isPayBlocked(null)).toBe(false);
  });
});

describe("warningMessage", () => {
  it("names both wallets and says what to do about a changed one", () => {
    const invoice = row("ACME-SUPPLIES", "INV-2", THIEF);
    const book: VendorBook = { "ACME-SUPPLIES": { recipient: GOOD, lastPaidBlock: 1n } };
    const message = warningMessage(walletWarnings({ rows: [invoice], book }).get(invoice.key)!);
    expect(message).toBe(
      "ACME-SUPPLIES was paid to 0x391c…E5eF before. This invoice uses 0x5B38…ddC4. " +
        "Confirm the new wallet with the vendor before paying.",
    );
  });

  it("explains a desk clash and still says to confirm with the vendor", () => {
    const a = row("ACME", "INV-1", GOOD);
    const message = warningMessage(walletWarnings({ rows: [a, row("ACME", "INV-2", THIEF)], book: {} }).get(a.key)!);
    expect(message).toContain("ACME appears on this desk with more than one wallet");
    expect(message).toContain("0x391c…E5eF");
    expect(message).toContain("0x5B38…ddC4");
    expect(message).toMatch(/Confirm the right wallet with the vendor before paying\.$/);
  });
});

describe("rememberConfirmation", () => {
  const key = (n: number) => deriveInvoiceKey("V", `INV-${n}`);

  it("adds a key", () => {
    expect(rememberConfirmation([], key(1))).toEqual([key(1)]);
  });

  it("does not store the same key twice", () => {
    expect(rememberConfirmation([key(1)], key(1))).toEqual([key(1)]);
  });

  it(`keeps at most ${MAX_CONFIRMATIONS} keys, dropping the oldest`, () => {
    let keys: Hex[] = [];
    for (let i = 1; i <= MAX_CONFIRMATIONS + 3; i++) keys = rememberConfirmation(keys, key(i));
    expect(keys).toHaveLength(MAX_CONFIRMATIONS);
    expect(keys).not.toContain(key(1));
    expect(keys[keys.length - 1]).toBe(key(MAX_CONFIRMATIONS + 3));
  });
});

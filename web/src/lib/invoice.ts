import { encodeAbiParameters, getAddress, isAddress, keccak256, type Address, type Hex } from "viem";
import { USDC_ADDRESS } from "@/config/env";
import { formatUsdcPlain, parseUsdc } from "./usdc";

/**
 * Invoice identity.
 *
 * key = keccak256(abi.encode("settleonce.invoice.v1", vendorRef, invoiceRef))
 *
 * Only the two business references go into the key. Recipient and amount are payment details:
 * if they were part of the key, editing either one would mint a "new" invoice and walk straight
 * past the duplicate guard. Row order, import time and random ids are never used either.
 *
 * The contract stores settlements per payer wallet, so the same key paid from two wallets is
 * two separate records (that is the documented scope of the guarantee).
 */
export const KEY_NAMESPACE = "settleonce.invoice.v1";
export const MAX_INVOICES = 20;
export const MAX_REF_LENGTH = 64;

export type Invoice = {
  key: Hex;
  vendorRef: string;
  invoiceRef: string;
  recipient: Address;
  amount: bigint;
};

export type InvoiceInput = {
  vendorRef: string;
  invoiceRef: string;
  recipient: string;
  amount: string;
};

export type FieldErrors = Partial<Record<keyof InvoiceInput, string>>;

/** NFKC, trim, collapse inner whitespace, upper-case. "  inv 1042 " and "INV 1042" are the same invoice. */
export function normalizeRef(ref: string): string {
  return ref.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

export function deriveInvoiceKey(vendorRef: string, invoiceRef: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "string" }],
      [KEY_NAMESPACE, normalizeRef(vendorRef), normalizeRef(invoiceRef)],
    ),
  );
}

function checkRef(value: string, label: string): string | undefined {
  const ref = normalizeRef(value);
  if (ref.length === 0) return `${label} is required.`;
  if (ref.length > MAX_REF_LENGTH) return `${label} must be ${MAX_REF_LENGTH} characters or fewer.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(ref)) return `${label} contains control characters.`;
  return undefined;
}

/**
 * Validate one invoice. `blockedRecipients` holds addresses that would lose funds
 * (the SettleOnce contract itself); the contract rejects them too.
 */
export function validateInvoice(
  input: InvoiceInput,
  blockedRecipients: Address[] = [],
): { ok: true; invoice: Invoice } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const vendorError = checkRef(input.vendorRef, "Vendor reference");
  if (vendorError) errors.vendorRef = vendorError;
  const invoiceError = checkRef(input.invoiceRef, "Invoice number");
  if (invoiceError) errors.invoiceRef = invoiceError;

  let recipient: Address | undefined;
  const rawRecipient = input.recipient.trim();
  if (!rawRecipient) errors.recipient = "Recipient wallet is required.";
  else if (!isAddress(rawRecipient, { strict: false })) errors.recipient = "Not a valid 0x address.";
  else {
    recipient = getAddress(rawRecipient);
    const lower = recipient.toLowerCase();
    if (/^0x0{40}$/.test(lower)) errors.recipient = "The zero address can't receive payments.";
    else if (lower === USDC_ADDRESS.toLowerCase()) errors.recipient = "That's the USDC token contract, not a wallet.";
    else if (blockedRecipients.some((a) => a.toLowerCase() === lower)) {
      errors.recipient = "That's the SettleOnce contract, not a wallet.";
    }
  }

  const amount = parseUsdc(input.amount);
  if (!amount.ok) errors.amount = amount.error;

  if (Object.keys(errors).length > 0 || !recipient || !amount.ok) return { ok: false, errors };

  const vendorRef = normalizeRef(input.vendorRef);
  const invoiceRef = normalizeRef(input.invoiceRef);
  return {
    ok: true,
    invoice: { key: deriveInvoiceKey(vendorRef, invoiceRef), vendorRef, invoiceRef, recipient, amount: amount.units },
  };
}

/** Same business key with different payment details is a conflict, not a duplicate. */
export function sameDetails(a: Invoice, b: Invoice): boolean {
  return a.recipient.toLowerCase() === b.recipient.toLowerCase() && a.amount === b.amount;
}

/* ------------------------------------------------------------------ CSV */

export const CSV_HEADER = ["vendor_ref", "invoice_ref", "recipient", "amount_usdc"] as const;

/** Minimal RFC 4180 reader: quoted fields, escaped quotes, CRLF or LF. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type CsvImport = {
  invoices: Invoice[];
  problems: { line: number; message: string }[];
  skippedDuplicates: number;
};

export function importInvoicesCsv(text: string, blockedRecipients: Address[] = []): CsvImport {
  const rows = readCsv(text);
  const problems: CsvImport["problems"] = [];
  const invoices: Invoice[] = [];
  let skippedDuplicates = 0;

  if (rows.length === 0) return { invoices, problems: [{ line: 1, message: "The file is empty." }], skippedDuplicates };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(CSV_HEADER.map((name) => [name, header.indexOf(name)])) as Record<
    (typeof CSV_HEADER)[number],
    number
  >;
  const missing = CSV_HEADER.filter((name) => col[name] < 0);
  if (missing.length > 0) {
    return {
      invoices,
      problems: [{ line: 1, message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` }],
      skippedDuplicates,
    };
  }

  const body = rows.slice(1);
  if (body.length > MAX_INVOICES) {
    problems.push({ line: 1, message: `Only the first ${MAX_INVOICES} rows are loaded (file has ${body.length}).` });
  }

  body.slice(0, MAX_INVOICES).forEach((cells, index) => {
    const line = index + 2;
    const result = validateInvoice(
      {
        vendorRef: cells[col.vendor_ref] ?? "",
        invoiceRef: cells[col.invoice_ref] ?? "",
        recipient: cells[col.recipient] ?? "",
        amount: cells[col.amount_usdc] ?? "",
      },
      blockedRecipients,
    );
    if (!result.ok) {
      problems.push({ line, message: Object.values(result.errors).join(" ") });
      return;
    }
    const existing = invoices.find((inv) => inv.key === result.invoice.key);
    if (existing) {
      if (sameDetails(existing, result.invoice)) skippedDuplicates++;
      else {
        problems.push({
          line,
          message: `${result.invoice.vendorRef} / ${result.invoice.invoiceRef} appears twice with different recipient or amount.`,
        });
      }
      return;
    }
    invoices.push(result.invoice);
  });

  return { invoices, problems, skippedDuplicates };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function invoicesToCsv(invoices: Invoice[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const inv of invoices) {
    lines.push([inv.vendorRef, inv.invoiceRef, inv.recipient, formatUsdcPlain(inv.amount)].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

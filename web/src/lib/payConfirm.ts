import type { ArcNetwork } from "@/config/chains";
import type { Invoice } from "./invoice";
import { formatUsdc } from "./usdc";

/**
 * The last look before real money moves.
 *
 * On Arc mainnet every payment goes through a confirmation the user has to read: the amount, the
 * whole recipient address (never shortened — a shortened address is exactly what an attacker who
 * swapped the middle is counting on), the two references that derive the invoice key, and the
 * plain fact that a settlement cannot be undone. On testnet nothing changes: the desk behaves
 * exactly as it did before.
 *
 * Pure on purpose, so the wording and the grouping are tested without a browser.
 */

export function payConfirmRequired(network: ArcNetwork): boolean {
  return network === "mainnet";
}

/**
 * The 40 hex characters of an address in groups of four, with `0x` carried on the first group:
 * ["0x391c", "7b24", …]. Ten groups, always, and joining them returns the address unchanged —
 * so what the dialog shows can be compared against paper character by character.
 */
export function addressGroups(address: string): string[] {
  const body = address.startsWith("0x") || address.startsWith("0X") ? address.slice(2) : address;
  const groups = body.match(/.{1,4}/g) ?? [];
  return groups.map((group, i) => (i === 0 ? `0x${group}` : group));
}

export type PayConfirmDetails = {
  /** "0.10" — the same string the ticket shows. */
  amountText: string;
  /** "Pay 0.10 USDC", the label on the confirming button. */
  payLabel: string;
  /** The full recipient, in 4-character groups. */
  recipientGroups: string[];
  /** The recipient as one string, for a screen reader and for copying. */
  recipient: string;
  vendorRef: string;
  invoiceRef: string;
};

export function payConfirmDetails(invoice: Invoice): PayConfirmDetails {
  const amountText = formatUsdc(invoice.amount);
  return {
    amountText,
    payLabel: `Pay ${amountText} USDC`,
    recipientGroups: addressGroups(invoice.recipient),
    recipient: invoice.recipient,
    vendorRef: invoice.vendorRef,
    invoiceRef: invoice.invoiceRef,
  };
}

/** Said in full, every time. There is no "don't ask again". */
export const PAY_CONFIRM_WARNING = "This cannot be undone.";

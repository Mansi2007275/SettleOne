import type { Address } from "viem";
import type { InvoiceInput } from "./invoice";

/**
 * A throwaway invoice that pays you 0.01 USDC from your own wallet, so the settle-once loop can be
 * tried on testnet without a counterparty.
 *
 * It only ever fills the composer form: the reader still presses "Add to desk", approves and pays,
 * exactly as with a real invoice. Nothing here is mock data — once added it is an ordinary invoice,
 * its key is derived the same way, and its paid status comes from the contract like any other.
 *
 * The invoice number is random because the key is `keccak256(namespace, vendorRef, invoiceRef)`:
 * a fixed number would derive the same key every time, so the second demo would hit `AlreadyPaid`
 * and never show the payment going through.
 */

/**
 * One demo press handed to the composer. `at` makes every press a new object, so pressing twice
 * re-fills the form with a fresh reference instead of looking like nothing happened.
 */
export type DemoFill = { input: InvoiceInput; at: number };

export const DEMO_VENDOR_REF = "DEMO-VENDOR";
export const DEMO_AMOUNT = "0.01";
export const DEMO_REF_PREFIX = "DEMO-";
export const DEMO_REF_RANDOM_LENGTH = 6;

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** `DEMO-` plus six random uppercase letters, e.g. `DEMO-KQWZPR`. */
export function demoInvoiceRef(random: () => number = Math.random): string {
  let ref = DEMO_REF_PREFIX;
  for (let i = 0; i < DEMO_REF_RANDOM_LENGTH; i += 1) {
    // clamp, so a random() that returns exactly 1 can't index past the end
    const index = Math.min(UPPERCASE.length - 1, Math.floor(random() * UPPERCASE.length));
    ref += UPPERCASE[index];
  }
  return ref;
}

/**
 * Values for the composer form. `payer` is the connected wallet, which becomes the recipient so the
 * demo pays you. With no wallet connected the recipient is left empty for the reader to fill in.
 */
export function demoInvoice(payer?: Address, random: () => number = Math.random): InvoiceInput {
  return {
    vendorRef: DEMO_VENDOR_REF,
    invoiceRef: demoInvoiceRef(random),
    recipient: payer ?? "",
    amount: DEMO_AMOUNT,
  };
}

import { encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * Invoice identity, byte-for-byte the same as the contract and the web desk:
 *
 *   key = keccak256(abi.encode("settleonce.invoice.v1", vendorRef, invoiceRef))
 *
 * Only the two business references go in. Recipient and amount are payment details: if they were
 * part of the key, editing either one would mint a "new" invoice and walk straight past the
 * duplicate guard. The references are normalized first, so "inv 1042" and "INV 1042" are one
 * invoice however they were typed.
 *
 * Pinned vector (contracts/test/SettleOnce.t.sol and web/src/lib/invoice.test.ts):
 *   VENDOR-7 / INV-1042 -> 0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b
 */
export const KEY_NAMESPACE = "settleonce.invoice.v1";
export const MAX_REF_LENGTH = 64;

/** NFKC, trim, collapse inner whitespace, upper-case. */
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

/** The same checks the desk applies before a reference is allowed to become a key. */
export function checkRef(value: string, label: string): string | undefined {
  const ref = normalizeRef(value);
  if (ref.length === 0) return `${label} is required.`;
  if (ref.length > MAX_REF_LENGTH) return `${label} must be ${MAX_REF_LENGTH} characters or fewer.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(ref)) return `${label} contains control characters.`;
  return undefined;
}

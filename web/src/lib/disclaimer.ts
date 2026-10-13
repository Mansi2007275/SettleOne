/**
 * The one disclaimer, written once.
 *
 * The footer prints it as a sentence on every page; the "How it works" page prints the same
 * limits as a list. Keeping the words here means the two can never drift apart.
 */

/** What the contract enforces, in the exact scope it enforces it. */
export const GUARANTEE_LINE =
  "For one chain, one SettleOnce deployment, one payer wallet and one invoice key: at most one successful settlement.";

export const GUARANTEES: readonly string[] = [
  "A second payment for an invoice key you already settled is rejected on chain with AlreadyPaid.",
  "Changing the recipient or the amount under a settled key is rejected with SettlementConflict, not paid as a new invoice.",
  "A failed USDC transfer reverts the record with it, so the invoice stays payable.",
  "Paid status is read from the contract, so it survives a crashed tab, a wiped browser and a new device.",
  "USDC moves from your wallet to the recipient inside one transferFrom. Nothing is held by the contract.",
];

/** The limits, as the footer says them. */
export const LIMITS_SENTENCE =
  "It can't tell whether an invoice is legitimate, stop payments made outside it, or recover a payment sent to the wrong address.";

export const LIMITS: readonly string[] = [
  "It can't tell whether an invoice is legitimate: a forged invoice with fresh references is a new invoice to the contract.",
  "It can't stop payments made outside it. A plain USDC transfer, or the same invoice paid from another wallet, is out of scope.",
  "It can't recover a payment sent to the wrong address. Check the recipient against the paper before you pay.",
  "It can't link the same real-world invoice entered under different references. Different references are a different key.",
  "It isn't a bookkeeping system. The invoice file stays yours; there is no backend and no database.",
];

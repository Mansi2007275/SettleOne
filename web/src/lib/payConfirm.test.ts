import { describe, expect, it } from "vitest";
import { deriveInvoiceKey, type Invoice } from "./invoice";
import { PAY_CONFIRM_WARNING, addressGroups, payConfirmDetails, payConfirmRequired } from "./payConfirm";

const RECIPIENT = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";

const invoice: Invoice = {
  key: deriveInvoiceKey("VENDOR-7", "INV-1042"),
  vendorRef: "VENDOR-7",
  invoiceRef: "INV-1042",
  recipient: RECIPIENT,
  amount: 100_000n, // 0.10 USDC
};

describe("when the confirmation is required", () => {
  it("asks on mainnet and nowhere else", () => {
    expect(payConfirmRequired("mainnet")).toBe(true);
    expect(payConfirmRequired("testnet")).toBe(false);
  });
});

describe("the recipient in 4-character groups", () => {
  const groups = addressGroups(RECIPIENT);

  it("is ten groups, the first carrying the 0x", () => {
    expect(groups).toHaveLength(10);
    expect(groups[0]).toBe("0x5B38");
    expect(groups.slice(1).every((g) => g.length === 4)).toBe(true);
  });

  it("joins back to exactly the address, same characters, same case", () => {
    expect(groups.join("")).toBe(RECIPIENT);
  });

  it("never shortens: an address that differs only in the middle looks different", () => {
    const swapped = "0x5B38Da6a701c568545dCfcB03FcB875f56bedd00";
    expect(addressGroups(swapped)).not.toEqual(groups);
    expect(addressGroups(swapped).at(-1)).toBe("dd00");
  });

  it("takes an address without the 0x prefix too", () => {
    expect(addressGroups(RECIPIENT.slice(2))).toEqual(groups);
  });
});

describe("what the dialog says", () => {
  const details = payConfirmDetails(invoice);

  it("names the amount, the button and both references", () => {
    expect(details.amountText).toBe("0.10");
    expect(details.payLabel).toBe("Pay 0.10 USDC");
    expect(details.vendorRef).toBe("VENDOR-7");
    expect(details.invoiceRef).toBe("INV-1042");
  });

  it("carries the whole recipient, grouped and plain", () => {
    expect(details.recipient).toBe(RECIPIENT);
    expect(details.recipientGroups.join("")).toBe(RECIPIENT);
  });

  it("says the payment cannot be undone", () => {
    expect(PAY_CONFIRM_WARNING).toBe("This cannot be undone.");
  });

  it("shows the exact amount for a sub-cent invoice, never rounded to zero", () => {
    expect(payConfirmDetails({ ...invoice, amount: 1n }).payLabel).toBe("Pay 0.000001 USDC");
  });
});

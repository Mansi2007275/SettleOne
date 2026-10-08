# What SettleOnce guarantees, and what it doesn't

## The guarantee

For **one chain**, **one SettleOnce deployment**, **one payer wallet** and **one invoice key**:

- the number of successful settlements is **at most one**;
- once settled, the recorded recipient and amount never change;
- if the USDC transfer fails for any reason (no allowance, no balance, a blocklisted address, a token error), the whole call reverts and the invoice stays unpaid and payable.

This is *at most once*, not *exactly once*: SettleOnce never promises that a payment will eventually succeed.

## How the invoice key is built

```
key = keccak256(abi.encode("settleonce.invoice.v1", normalize(vendorRef), normalize(invoiceRef)))
normalize = Unicode NFKC, trim, collapse inner whitespace, upper-case
```

Only the business references are in the key. Never the recipient, the amount, a row number, an import time, a random id, or a transaction hash. All of those change between retries; the invoice doesn't.

`inv-1042` and `INV-1042` are the same invoice by design.

## Not covered

- **The same real invoice under different references.** If someone types `INV 1042` once and `INV-1042` later, those are two keys.
- **Other payer wallets.** Records are per payer. The same key paid from two wallets is two settlements.
- **Other contracts or chains.** A new deployment starts with an empty record.
- **Direct USDC transfers** that don't go through `payOnce`.
- **Whether an invoice is legitimate.** SettleOnce doesn't detect fraud.
- **Recovering a wrong first payment.** There is no refund or reset, on purpose.
- **Lost invoice files.** The chain can confirm a key you still have; it can't rebuild references you never saved. Keep the CSV.

## Privacy

Only the key (a hash) goes on chain, together with payer, recipient and amount, which are visible in any USDC transfer anyway. Invoice references stay off chain. A hash of a guessable reference such as `INV-1042` is **not** confidential: anyone who guesses the reference can compute the key.

## Arc-specific notes

- Amounts use the USDC ERC-20 interface at `0x3600…0000` (6 decimals). Native USDC (18 decimals) pays gas. They are one balance; the app shows it once.
- Arc's blocklist can make a transfer revert. That revert rolls back the settlement record too, which is covered by `test_blockedRecipient_leavesUnpaid`.
- `paidAtBlock` uses block numbers, not timestamps, for ordering, since Arc timestamps can repeat across sub-second blocks.

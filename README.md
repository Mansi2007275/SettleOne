# SettleOnce

**Pay each USDC invoice on Arc at most once, and find out what was already paid after the app crashes.**

| | |
|---|---|
| Live app | _add your Vercel URL after deploying_ |
| Contract (Arc Testnet) | _add address + explorer link_ |
| Contract (Arc mainnet) | _add address + explorer link_ |
| Demo video | _add link_ |

---

## The problem

You pay a contractor's invoice from your wallet. The transaction goes through, but your app freezes before it shows "paid". You reopen it and the invoice looks unpaid. Do you pay again?

A transaction hash tells you *a* transfer happened. It doesn't tell you *which invoice* it settled, and it's gone once the tab is gone.

## What SettleOnce does

Every invoice gets a permanent **invoice key**, derived only from its business references:

```
key = keccak256(abi.encode("settleonce.invoice.v1", vendorRef, invoiceRef))
```

The SettleOnce contract pays USDC straight from your wallet to the recipient and records the settlement under `(your wallet, invoice key)`. From then on:

- Reopen the app, load your invoice file, and the chain tells you which invoices are paid, with the original transaction.
- A brand-new transaction for the same invoice is rejected with `AlreadyPaid`.
- Changing the recipient or amount under an already-paid key is rejected with `SettlementConflict`.
- A failed transfer reverts everything, so the invoice stays payable.

Recipient and amount are deliberately **not** part of the key. If they were, editing either one would create a "new" invoice and walk straight past the guard.

### The exact guarantee

> For one chain, one SettleOnce deployment, one payer wallet and one invoice key: **at most one successful settlement.**

It does not cover the same real-world invoice entered under different references, other payer wallets, direct USDC transfers that bypass the contract, or whether an invoice is legitimate. See [docs/GUARANTEE.md](docs/GUARANTEE.md).

## How it works

```
invoice file (CSV) ──► invoice key ──► receiptsFor(payer, keys)  ──► Paid / Conflict / Ready
                                             │
                          unpaid ──► approve exact amount ──► simulate payOnce ──► payOnce
                                                                                    │
                                     contract checks (payer, key) ─► record ─► USDC transferFrom payer → recipient
                                                                       └─ any failure reverts the record too
```

- **No backend, no database.** Paid status always comes from the contract. The browser only keeps your desk for convenience.
- **Funds never sit in the contract.** USDC moves payer → recipient inside one `transferFrom`.
- **No admin.** No owner, no reset, no upgrade proxy, no arbitrary calls. USDC address is immutable.
- **Receipts without an indexer.** The contract stores the settlement block, so the app finds the original transaction with a one-block log query.
- **Arc-correct units.** Business amounts use the USDC ERC-20 interface (6 decimals, `0x3600…0000`). Native USDC (18 decimals) only pays gas. One balance, shown once.

## Pages

- **Desk** (`/`): write invoices or load a CSV, connect a wallet, pay. Each invoice is a ticket; paying punches its stub. Includes a clearly labelled **crash test** that wipes the desk and reloads right after the wallet sends, so you can demonstrate recovery.
- **Receipt** (`/receipt/<payer>/<key>`): a public, wallet-free receipt read live from the contract.
- **Ledger** (`/ledger`): every `InvoicePaid` event, newest first, plus a lookup form.

## Repository layout

```
contracts/           Foundry project
  src/SettleOnce.sol           the settlement contract
  test/SettleOnce.t.sol        unit + fuzz tests (duplicate, conflict, rollback, scope, reentrancy)
  test/SettleOnce.invariant.t.sol   invariant: ≤1 settlement per (payer, key), balances match
  script/DeploySettleOnce.s.sol     deploys against Arc USDC, writes deployments/<network>.json
web/                 Next.js 15 + wagmi + viem app
  src/config/        Arc chains, env, wagmi
  src/lib/           invoice keys, CSV, USDC units, errors
  src/hooks/         settlement reads, pay flow, receipt tx lookup, ledger scan
  src/components/    desk, receipt, ledger, wallet UI
deployments/         addresses written by the deploy script
docs/                deploy guide, guarantee, verification record
examples/            blank invoice file
```

## Run it

Full step-by-step (including Windows/WSL): **[docs/DEPLOY.md](docs/DEPLOY.md)**.

```bash
# contracts
cd contracts
arc-forge install foundry-rs/forge-std
arc-forge test                    # or: arc-forge test --network arc

# web
cd ../web
npm ci
cp .env.example .env.local        # fill in the contract address after deploying
npm run dev
```

## Tests

| Suite | What it proves |
|---|---|
| `contracts/test/SettleOnce.t.sol` | Exact amount moves once; a fresh transaction with ample balance **and** allowance still hits `AlreadyPaid`; changed amount/recipient hits `SettlementConflict`; false-returning, reverting and blocklisted transfers leave the key unpaid and payable later; strangers can't spend a payer's allowance; per-payer scope; input validation; reentrancy; key derivation pinned against the web app |
| `contracts/test/SettleOnce.invariant.t.sol` | Under random payers, keys, recipients, amounts and failing transfers: never more than one settlement per (payer, key); recipient balances equal recorded settlements; contract holds nothing |
| `web/src/lib/invoice.test.ts` | Same key as Solidity; normalization; key ignores recipient/amount; 0.10 USDC = 100,000 units; CSV round-trip, reordering, duplicate and conflict detection |

Results are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Why Arc

Arc lets the payer use USDC for both the invoice and the gas, so a small team needs exactly one asset. Finality is deterministic and sub-second, so "paid" on the receipt means paid. SettleOnce adds a business-level rule on top: one invoice, one payment, recoverable from the chain alone.

The at-most-once idea itself is portable to any EVM chain; SettleOnce doesn't claim Arc is the only place it could exist. Circle's Wallets API also offers idempotency keys for API-driven transfers; SettleOnce targets direct wallet payments where the rule lives in your own payment path.

## License

MIT, see [LICENSE](LICENSE).

Built by Mansi Yadav ([@0xmansiyadav](https://x.com/0xmansiyadav), GitHub [Mansi2007275](https://github.com/Mansi2007275)) for Arc Microgrants.

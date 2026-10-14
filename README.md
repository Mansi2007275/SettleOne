# SettleOnce

**At-most-once USDC settlement on Arc — for people, apps and AI agents.**

Pay each USDC invoice on Arc at most once, and find out what was already paid after the app crashes, the tab closes or an agent retries.

> ✅ **Live on Arc mainnet** · source verified on the explorer · first real settlement on 14 Oct 2026
> ![Uploading image.png…]()


| | |
|---|---|
| **Live app (Arc mainnet)** | https://settle-one-mainnet.vercel.app |
| Live app (Arc Testnet, free to try) | https://settle-one-sandy.vercel.app |
| **Contract (Arc mainnet, verified)** | [`0x0D582d835E515CC0EC02C9b562F9120BF308CA2c`](https://explorer.arc.io/address/0x0D582d835E515CC0EC02C9b562F9120BF308CA2c?tab=contract) |
| First mainnet settlement | [`0x65aca9ec…a63ef`](https://explorer.arc.io/tx/0x65aca9ecb4eba41a301a52a536b455fa45d3b0a34fefdcb87e51182ab0aa63ef) |
| Contract (Arc Testnet) | [`0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF`](https://explorer.testnet.arc.io/address/0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF) |
| Demo video | _coming soon_ |
| Verification record | [docs/VERIFICATION.md](docs/VERIFICATION.md) |

### Try it in two minutes (testnet, no real money)

1. Get free test USDC from the [Circle faucet](https://faucet.circle.com) (choose **Arc Testnet**).
2. Open the [testnet app](https://settle-one-sandy.vercel.app) and connect MetaMask.
3. Press **Try with a demo invoice** → **Pay**. The ticket is punched **PAID ONCE**.
4. Add the same invoice again and press Pay: the chain refuses it.
5. Turn on **Crash test**, pay another invoice, then load your saved file: the chain tells you what already went out.

### What's inside

| | |
|---|---|
| 🔒 **The contract** | One payer wallet + one invoice key = one settlement, ever. No admin, no custody, no upgrade proxy. |
| ✍️ **One-signature pay** | `approve` + `payOnce` in a single transaction through Arc's `Multicall3From`, with your wallet still `msg.sender`. |
| 💥 **Crash recovery** | Save the desk as a CSV; after any crash, load it and the chain fills in what's paid. |
| 📷 **Scan invoice** | Photo → form, OCR runs inside the browser tab. Nothing is uploaded. |
| 🧾 **Receipts** | Public receipt page read live from the contract, with PDF/JSON download and a QR code. |
| 🔍 **Duplicate Radar** | Paste any wallet: finds suspected double payments in its plain USDC history. |
| 🚨 **Wallet-change guard** | Warns and holds Pay when a known vendor's wallet suddenly changes. |
| 🌐 **`/api/paid`** | One HTTP call tells a vendor or a script whether an invoice was paid. |
| 🤖 **SDK + AI agent** | `settleonce-sdk` and a crash-safe paying agent: kill it mid-payment, rerun, nothing is paid twice. |
| 🛡️ **Mainnet safety** | "Arc mainnet · real USDC" banner, a confirm dialog before every payment, demo tools hidden. |

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
                          unpaid ──► allowance enough? ──► simulate payOnce ──► payOnce
                                             │                                      │
                                             └─ short ──► one batch: approve + payOnce (1 signature)
                                                                │
                                     contract checks (payer, key) ─► record ─► USDC transferFrom payer → recipient
                                                                       └─ any failure reverts the record too
```

- **One signature when the allowance is short.** `approve` and `payOnce` go out as a single transaction through Arc's [`Multicall3From`](https://docs.arc.io/arc/concepts/batched-transactions) predeploy (`0x522fAf9A91c41c443c66765030741e4AaCe147D0`). It routes each sub-call through Arc's `CallFrom` precompile, so **your wallet stays `msg.sender`**: USDC spends your own allowance and `InvoicePaid` names you as the payer, not the multicall contract. Both calls use `allowFailure: false`, so the batch is all-or-nothing — a duplicate still reverts, and the approval reverts with it, leaving no allowance behind. The batch is simulated from your account first; if it won't simulate, the desk falls back to the ordinary two-step approve-then-pay without you doing anything. When the allowance already covers the invoice, nothing is batched: it is one `payOnce`.
- **No backend, no database.** Paid status always comes from the contract. The browser only keeps your desk for convenience.
- **Funds never sit in the contract.** USDC moves payer → recipient inside one `transferFrom`.
- **No admin.** No owner, no reset, no upgrade proxy, no arbitrary calls. USDC address is immutable.
- **Receipts without an indexer.** The contract stores the settlement block, so the app finds the original transaction with a one-block log query.
- **Arc-correct units.** Business amounts use the USDC ERC-20 interface (6 decimals, `0x3600…0000`). Native USDC (18 decimals) only pays gas. One balance, shown once.

## Pages

- **Desk** (`/`): write invoices, load a CSV or **scan a photo of an invoice**, connect a wallet, pay. Each invoice is a ticket; paying punches its stub. A live **Your progress** stepper at the top reads the wallet, the desk and the chain and says which of the six steps you are on; "Hide" only collapses it to a one-line bar, so the loop is never hidden for good. Includes a clearly labelled **crash test** that wipes the desk and reloads right after the wallet sends, so you can demonstrate recovery.
- **How it works** (`/how`): the six steps in full, what the contract guarantees, and what it deliberately does not do.
- **Receipt** (`/receipt/<payer>/<key>`): a public, wallet-free receipt read live from the contract, with a QR
  code of its own link. Once the contract says paid, **Download JSON** and **Download PDF** keep a copy: the
  JSON carries the exact base units and the explorer links, the PDF is the slip itself, QR code and `PAID ONCE`
  stamp included. Both are built in the tab — `jspdf` and `qrcode` are pinned and loaded as their own chunks,
  nothing is uploaded, and there is still no backend.
- **Wallet-change guard** (on the desk): the desk remembers, from the chain only, which wallet each vendor was last paid at. If a new invoice for a known vendor points somewhere else — the commonest invoice fraud there is — the ticket says which wallet was paid before and which one this invoice uses, and **Pay is held** until you tick "I confirmed this wallet with the vendor". One vendor reference carrying two different wallets on the same desk warns on both tickets. The invoice key deliberately ignores the recipient, so the contract cannot catch this; the desk has to.
- **Radar** (`/radar`): paste any address and the page reads its USDC transfers off the chain, then flags the same amount landing at the same recipient twice inside a window you choose (1 hour / 24 hours / 7 days). Everything it finds is labelled *suspected*: a retainer and a double payment look identical from outside. It needs no wallet, and SettleOnce is not involved — these are plain transfers, the way most invoices are paid today.
- **Ledger** (`/ledger`): every `InvoicePaid` event, newest first, plus a lookup form.

## Scan invoice (optional)

Typing a wallet address off a paper invoice is where a payment goes wrong. The desk can read the
invoice for you instead:

1. **Scan invoice** → drop a JPG/PNG/WebP (up to 8 MB) or use your phone camera.
2. OCR runs **inside the browser tab** with [tesseract.js](https://github.com/naptha/tesseract.js) (pinned, loaded as its own chunk only when you open the scanner). The image is never uploaded, and there is no backend and no API key. Only the English language data is fetched, once, from a CDN.
3. The *existing* form is pre-filled. Each field it filled is tagged **from image**; anything missing or unverified is highlighted yellow with **Check this**. A **Text we read** box shows the raw OCR output so you can copy from it.
4. **You** review and press **Add to desk**. Nothing is ever added or paid automatically.

The parser never guesses: a field it cannot read with evidence stays empty. It fixes only the three
characters OCR actually confuses in a wallet address (`O`→`0`, `l`/`I`→`1`), only inside the `0x`
token, and only keeps the result if viem accepts it. A valid EIP-55 checksum marks the address
confirmed; a mixed-case address whose checksum fails is flagged, never silently corrected. Because
an address can still be wrong in a way no checksum catches, the form asks you to compare it with
the paper character by character.

Scanning changes nothing below it: the invoice key is still
`keccak256(abi.encode("settleonce.invoice.v1", vendorRef, invoiceRef))`, and the approve-then-pay
flow and the contract are untouched.

## Repository layout

```
contracts/           Foundry project
  src/SettleOnce.sol           the settlement contract
  test/SettleOnce.t.sol        unit + fuzz tests (duplicate, conflict, rollback, scope, reentrancy)
  test/SettleOnce.invariant.t.sol   invariant: ≤1 settlement per (payer, key), balances match
  script/DeploySettleOnce.s.sol     deploys against Arc USDC, writes deployments/<network>.json
web/                 Next.js 15 + wagmi + viem app
  src/config/        Arc chains, env, wagmi
  src/lib/           invoice keys, CSV, USDC units, OCR field parsing, receipt export + QR, errors
  src/hooks/         settlement reads, pay flow, receipt tx lookup, ledger scan, duplicate scan
  src/app/api/paid/  proof-of-payment endpoint (one contract read, no cache)
  src/components/    desk, invoice scanner, receipt, ledger, wallet UI
sdk/                 settleonce-sdk: pay an invoice once from any app or AI agent (viem only)
  src/invoiceKey.ts            the same key as the contract and the web app
  src/settlement.ts            chain reads + the pure pay / already-paid / conflict decision
  src/payOnce.ts               read chain, approve exactly, pay, wait, read back
deployments/         addresses written by the deploy script
docs/                deploy guide, guarantee, verification record
examples/            blank invoice file, and agent-pay: a crash-safe paying agent
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
| `web/src/lib/batchPay.test.ts` | The one-signature batch: approve comes before `payOnce`, `allowFailure` is `false` on both, the approval is exactly the invoice amount and matches what is paid, the key/recipient/amount come from the invoice, zero amounts and USDC-as-spender are refused |
| `web/src/lib/receiptExport.test.ts` | The kept copy: every contract fact written out, amounts as exact base units, references only when they derive the key, filename slug and fallback to the short key, receipt link encoding, the PDF's line list |
| `web/src/lib/qr.test.ts` | QR geometry: quiet zone, dark modules collapsed into runs and covered exactly once, path output, a matrix that doesn't add up is refused |
| `web/src/lib/receiptPdf.test.ts` | PDF ink: theme tokens resolved per token, anything that isn't a plain hex falls back instead of silently printing black |
| `web/src/lib/walletGuard.test.ts` | The wallet-change guard: the memory is only written from confirmed settlements, an older settlement never overwrites a newer one, at most 100 vendors with the oldest payment dropped first, a changed recipient warns while the same one (in any case) does not, two wallets for one vendor warn both tickets, a settled row is never held back, and a confirmation unlocks exactly one invoice key |
| `web/src/lib/duplicateRadar.test.ts` | The radar's heuristic: grouping by recipient and amount, the window edge exactly on and one second past, the window measured from each cluster's first payment, different amounts and recipients left alone, bigint amounts beyond float range, one block holding two transfers, and only the blocks that could pair up getting a timestamp read |
| `web/src/lib/paidApi.test.ts` | The proof-of-payment endpoint: the same key as the desk, normalized references, every bad-input case named, unpaid answered as nulls rather than zeros, blocks as strings past `MAX_SAFE_INTEGER`, escaped receipt links, and the forwarded-host origin |
| `sdk/src/invoiceKey.test.ts` | The SDK derives the same key as the contract: the pinned `VENDOR-7 / INV-1042` vector, normalization, references that must stay apart, and no collision between the two fields |
| `sdk/src/amount.test.ts` | Strict amounts: `0.01` is 10,000 base units, commas / signs / exponents / 7 decimals / zero are all refused, and Arc's 20 gwei fee floor is applied even with no estimate |
| `sdk/src/errors.test.ts` | Error mapping from real viem reverts: `AlreadyPaid` and `SettlementConflict` become statuses, everything else stays an error |
| `sdk/src/settlement.test.ts` | The status decision: unpaid pays, same details is already-paid, a changed recipient or a one-unit amount change is a conflict, and block 0 is the only "never settled" |
| `web/src/lib/flowProgress.test.ts` | The six-step stepper: each step's done rule, the current step is the first unfinished one, a later step can be done while an earlier one is open, the recovery tip never becomes the current step or blocks the one after it, and the newest paid receipt is picked by settlement block as a bigint |
| `web/src/lib/invoiceScan.test.ts` | OCR text samples: clean invoice, missing wallet, `1,250.00` and `$1,250.00`, European separators, `O`/`l` repaired inside the address, subtotal vs total, two totals that disagree, no invoice number, Hindi/English labels, broken checksum, several addresses, unreadable text, and the letterhead's trailing document word (`INVOICE`, `TAX INVOICE`, `BILL`, `RECEIPT`, `CASH MEMO`, `ORIGINAL`, `DUPLICATE`) dropped from the vendor name while `Bill Hicks Design` keeps its own |
| `web/src/lib/payConfirm.test.ts` | The mainnet confirmation: asked on mainnet and nowhere else, the recipient in ten groups of four that join back to exactly the address, a middle-swapped address that looks different, the amount and button label, and "This cannot be undone" |
| `web/src/lib/demoGate.test.ts` | The demo gate: demo invoice and crash test always on testnet, off on mainnet, back only for an exact `?demo=1` and not for `demo=true`, `demo=` or `demo=11` |
| `web/src/lib/deskFile.test.ts` | The invoice-file bench's file check: CSV by type or extension (Excel's `application/vnd.ms-excel` included), an invoice photo or PDF answered with the scanner instead of a size complaint, a real CSV still refused past 64 KB, and a PDF not offered to an image-only reader |

Results are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Proof-of-payment API

One HTTP call answers "has this wallet paid this invoice?", for an accounting system, a vendor
portal, a shell script or an agent with no wallet of its own.

```
GET /api/paid?payer=<address>&vendor=<vendor_ref>&invoice=<invoice_ref>
```

```bash
curl -s "https://settle-one-mainnet.vercel.app/api/paid?payer=0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF&vendor=VENDOR-7&invoice=INV-1042"
```

```json
{
  "paid": true,
  "recipient": "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
  "amountUsdc": "0.02",
  "paidAtBlock": "4210",
  "invoiceKey": "0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b",
  "receiptUrl": "https://<your-deployment>/receipt/0x391c…/0xab5b…?v=VENDOR-7&i=INV-1042"
}
```

- The references are normalized and hashed into the invoice key exactly as the desk does, so
  `vendor-7` and `VENDOR-7` are the same invoice.
- An unpaid invoice answers `"paid": false` with `recipient`, `amountUsdc` and `paidAtBlock` as
  `null` — never zeros that could be mistaken for a real settlement. `receiptUrl` is always there.
- `paidAtBlock` is a string: JSON has no 64-bit integers, and a block number is not worth rounding.
- Every answer is a fresh contract read, served `cache-control: no-store`. There is no database.
- `400` names the parameter that was wrong, `503` means this deployment has no contract configured,
  and `502` means the chain could not be read — which is never reported as "not paid".

## Use SettleOnce from your app or AI agent

The rule is not a feature of the web desk — it lives in the contract, so anything that can sign a
transaction can use it. [`settleonce-sdk`](sdk) is that path: TypeScript, ESM, `viem` only.

```ts
import { createArcClients, payOnce } from "settleonce-sdk";

const { publicClient, walletClient } = createArcClients({ network: "testnet", privateKey: process.env.PRIVATE_KEY! });

const result = await payOnce(walletClient, publicClient, {
  contract: process.env.SETTLEONCE_ADDRESS!,
  vendorRef: "VENDOR-7",
  invoiceRef: "INV-1042",
  recipient: "0x…",
  amountUsdc: "0.02",
});

// "paid" | "already-paid" | "conflict" — a rerun can never pay twice
console.log(result.status, result.receipt.paidAtBlock);
```

`payOnce` reads the chain before it signs anything, approves exactly the invoice amount when the
allowance is short, and maps the `AlreadyPaid` and `SettlementConflict` reverts onto statuses
instead of exceptions. An agent needs no journal, no database and no idempotency key of its own:
the invoice's own references are the key.

### The demo: an agent that dies mid-payment

[`examples/agent-pay`](examples/agent-pay) pays a JSON file of bills and can be killed the instant
a payment is broadcast — the one moment a retry normally turns into a double payment.

```powershell
cd sdk; npm install                                   # viem, once
cd ..\examples\agent-pay
Copy-Item .env.example .env                           # PRIVATE_KEY, NETWORK, SETTLEONCE_ADDRESS
Copy-Item bills.example.json bills.json               # put your second wallet in "recipient"
cd ..\..

npx tsx examples/agent-pay/agent-pay.ts examples/agent-pay/bills.json --crash-after=1
# 💥 Agent crashed        (exit 1, the agent never learns the outcome)

npx tsx examples/agent-pay/agent-pay.ts examples/agent-pay/bills.json
# bill 1 -> ALREADY PAID (block N) · the rest -> PAID NOW
```

Full walkthrough, including how to force a `CONFLICT`, in
[examples/agent-pay/README.md](examples/agent-pay/README.md).

## Why Arc

Arc lets the payer use USDC for both the invoice and the gas, so a small team needs exactly one asset. Finality is deterministic and sub-second, so "paid" on the receipt means paid. SettleOnce adds a business-level rule on top: one invoice, one payment, recoverable from the chain alone.

The at-most-once idea itself is portable to any EVM chain; SettleOnce doesn't claim Arc is the only place it could exist. Circle's Wallets API also offers idempotency keys for API-driven transfers; SettleOnce targets direct wallet payments where the rule lives in your own payment path.

## License

MIT, see [LICENSE](LICENSE).

Built by Mansi Yadav ([@0xmansiyadav](https://x.com/0xmansiyadav), GitHub [Mansi2007275](https://github.com/Mansi2007275)) for Arc Microgrants.

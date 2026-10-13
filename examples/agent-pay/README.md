# agent-pay

An AI agent paying a list of bills on Arc — and surviving its own death mid-payment.

The agent keeps **no state of its own**. Every bill is checked against the SettleOnce contract
before anything is signed, and the contract refuses a second settlement for an invoice key it has
already recorded. So the interesting command here is not the first run, it is the rerun after a
crash: it never pays twice, and it tells you exactly which bills were already settled.

```
VENDOR          | INVOICE  | STATUS       | LINK
-------------------------------------------------------------------
ACME-SUPPLIES   | INV-1042 | ALREADY PAID | https://explorer.testnet.arc.io/block/41207
NORTHWIND-PRINT | NW-2201  | PAID NOW     | https://explorer.testnet.arc.io/tx/0x…
VENDOR-7        | INV-1042 | CONFLICT     | https://explorer.testnet.arc.io/block/39981
```

| Status | Meaning |
|---|---|
| `PAID NOW` | Sent and confirmed in this run. |
| `ALREADY PAID` | The chain already holds this exact payment. Nothing was sent. |
| `CONFLICT` | That invoice key is settled with a **different** recipient or amount. Nothing was sent — check with the vendor. |
| `FAILED` | Something else went wrong (no funds, RPC down). The invoice is still payable. |

The process exits `1` if any bill ended as `CONFLICT` or `FAILED`, so a scheduler notices.

## Setup (Windows PowerShell)

```powershell
# 1. the SDK's dependencies (viem) — the example imports the SDK from source
cd C:\path\to\settleonce\sdk
npm install

# 2. secrets, next to the script
cd ..\examples\agent-pay
Copy-Item .env.example .env
notepad .env          # PRIVATE_KEY, NETWORK=testnet, SETTLEONCE_ADDRESS

# 3. the bills the agent should pay
Copy-Item bills.example.json bills.json
notepad bills.json    # put your SECOND wallet in "recipient", keep amounts small
```

Use a throwaway testnet wallet with a few USDC in it. `.env` and `bills.json` are gitignored, and
the agent never prints the private key.

## Run it

```powershell
cd C:\path\to\settleonce

# pay the file
npx tsx examples/agent-pay/agent-pay.ts examples/agent-pay/bills.json

# run it again: every bill comes back ALREADY PAID, nothing is sent
npx tsx examples/agent-pay/agent-pay.ts examples/agent-pay/bills.json
```

## The demo: crash it

```powershell
# die right after the first payment transaction is broadcast
npx tsx examples/agent-pay/agent-pay.ts examples/agent-pay/bills.json --crash-after=1
# …
# 💥 Agent crashed        (exit code 1, outcome unknown to the agent)

# the money may or may not have moved. Ask the chain, not your logs:
npx tsx examples/agent-pay/agent-pay.ts examples/agent-pay/bills.json
# bill 1 -> ALREADY PAID (settled in block N) · bills 2 and 3 -> PAID NOW
```

`--crash-after=N` exits the process with code 1 the instant the N-th payment transaction is sent,
before it is confirmed — the worst possible moment, and the one a retry loop usually turns into a
double payment.

## Conflicts on purpose

Pay `bills.json`, then edit one row's `amountUsdc` or `recipient` and run it again. That row comes
back `CONFLICT` with the details the chain actually holds. The references — `vendorRef` and
`invoiceRef` — are the invoice's identity; changing the payment details under them does not create
a new invoice, which is the whole point of the key.

## The bills file

```json
[{ "vendorRef": "ACME-SUPPLIES", "invoiceRef": "INV-1042", "recipient": "0x…", "amountUsdc": "0.01" }]
```

Amounts are plain decimal USDC (max 6 decimals, no commas, no `$`). The file is validated in full
before any payment goes out, so a typo in the last row stops the first one too. Two rows that
normalize to the same invoice key are rejected as well — that is one invoice, not two.

## In your own app

This example imports the SDK from source (`../../sdk/src`) because it lives in the same repository.
In your own project, install it and import the package instead:

```ts
import { createArcClients, payOnce } from "settleonce-sdk";
```

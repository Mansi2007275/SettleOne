# settleonce-sdk

Pay a USDC invoice on Arc **at most once**, from any app or AI agent. TypeScript, ESM, `viem` is
the only dependency.

```ts
import { createArcClients, payOnce } from "settleonce-sdk";

const { publicClient, walletClient } = createArcClients({
  network: "testnet",
  privateKey: process.env.PRIVATE_KEY!,
});

const result = await payOnce(walletClient, publicClient, {
  contract: process.env.SETTLEONCE_ADDRESS!,
  vendorRef: "VENDOR-7",
  invoiceRef: "INV-1042",
  recipient: "0x…",
  amountUsdc: "0.02",
});

// "paid" | "already-paid" | "conflict" — never a second payment
console.log(result.status, result.receipt.amountUsdc, result.receipt.paidAtBlock);
```

Call it again with the same references and nothing is sent: `payOnce` reads the chain first, and
the contract refuses a second settlement anyway. That is the whole idea — a crashed process, a
retry loop or a duplicated queue message cannot pay an invoice twice.

## API

| Export | What it does |
|---|---|
| `deriveInvoiceKey(vendorRef, invoiceRef)` | The invoice's permanent key, identical to the contract and the web desk. Normalizes case and whitespace. |
| `getSettlement(publicClient, { contract, payer, key })` | What the chain holds for one (payer, key): `paid`, `recipient`, `amount` (base units), `amountUsdc`, `paidAtBlock`, `paidAt`. |
| `getSettlements(publicClient, { contract, payer, keys })` | The same for many keys in one call. |
| `payOnce(walletClient, publicClient, input)` | Read the chain, approve exactly the amount if needed, pay, wait, read the settlement back. Returns `paid` / `already-paid` / `conflict`. |
| `decidePayAction({ receipt, recipient, amount })` | The pure decision behind it: `"pay"`, `"already-paid"` or `"conflict"`. |
| `createArcClients({ network, privateKey, rpcUrl? })` | The two viem clients, pointed at Arc. The key never leaves the process. |
| `arcTestnet` / `arcMainnet`, `USDC_ADDRESS`, `txUrl`, `blockUrl` | Chain definitions (5042002 / 5042), Arc's 6-decimal USDC interface, explorer links. |
| `parseUsdcAmount` / `formatUsdcAmount` | Strict decimal ↔ base units. No commas, no exponents, max 6 decimals, never zero. |
| `payStatusFromError` / `explainError` / `SettleOnceError` | `AlreadyPaid` and `SettlementConflict` reverts mapped onto statuses; everything else explained in one sentence. |

Details that matter:

- **Approvals are exact.** The allowance is read first, and approved for this invoice's amount
  only — never unlimited, so a blocked payment leaves nothing lying around.
- **Arc's fee floor.** Every write is sent with `maxFeePerGas` of at least 20 gwei, even when the
  RPC cannot estimate fees.
- **`onSent(txHash)`** fires the moment the payment is broadcast, before confirmation. That is the
  window a crash-safety demo (or your own journal) wants.
- **A revert is not a crash.** The two reverts that mean "already settled" come back as statuses
  with the on-chain receipt attached; anything else throws a `SettleOnceError` with a `code`.

## Scope of the guarantee

For one chain, one SettleOnce deployment, one payer wallet and one invoice key: at most one
successful settlement. It does not cover the same real-world invoice entered under different
references, other payer wallets, or direct USDC transfers that bypass the contract. See
[docs/GUARANTEE.md](../docs/GUARANTEE.md).

## Development

```bash
cd sdk
npm install
npm run typecheck     # also typechecks examples/agent-pay
npm test              # key derivation, amount parsing, error mapping, status decision
```

A worked crash-and-rerun demo lives in [examples/agent-pay](../examples/agent-pay).

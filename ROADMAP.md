# Roadmap

## v0.1 (this release): the core loop

- [x] `SettleOnce` contract: at-most-once settlement per (payer, invoice key), no custody, no admin
- [x] Tests: duplicate, conflict, rollback on failed/blocked transfer, scope, reentrancy, fuzz, invariants
- [x] Deploy script for Arc Testnet / mainnet, writes `deployments/<network>.json`
- [x] Desk: write invoices, CSV load/save, approve-exact + pay, status always read from chain
- [x] Crash test (labelled fault injection) and recovery from the saved file
- [x] Public receipt page and ledger, no wallet needed
- [x] Optional **Scan invoice**: in-browser OCR (tesseract.js) pre-fills the form; the user still reviews and adds
- [ ] Deployed and verified on Arc Testnet, run-through recorded in `docs/VERIFICATION.md`
- [ ] Deployed on Arc mainnet, real settlement linked from the README
- [ ] 90-second demo video

## Next, one feature per pull request

1. **One-click approve + pay with `Multicall3From`** (Arc predeploy `0x522fAf9A91c41c443c66765030741e4AaCe147D0`). It keeps `msg.sender` as the payer for both sub-calls; use `allowFailure: false` on both so the batch is all-or-nothing. Test sender preservation and rollback on testnet first, and keep the two-step path as a fallback.
2. **In-flight payment notice.** Remember the last sent transaction hash locally so that, after a crash, the desk can say "a payment for INV-1042 was sent at 19:14, confirming…" while the chain catches up. The chain stays the source of truth.
3. **Local E2E harness in the repo**: `arc-anvil` fork of testnet + Playwright script that runs the full crash-and-recover flow in CI.
4. **Pay all ready**: run the existing one-at-a-time flow down the list, stopping at the first error.
5. **Receipt export**: download a receipt as PDF / JSON for accounting.
6. **Better scanning**: PDF pages as input, a crop/rotate step before OCR, a self-hosted copy of the language data so scanning works offline, and line-item reading so a multi-invoice page becomes several tickets. Still pre-fill only — the user always confirms.

Out of scope on purpose: escrow, refunds, subscriptions, cross-chain, AI invoice parsing, multi-wallet organisations.

## Suggested commit sequence for v0.1

If you want a readable history instead of one big import:

```bash
git add .gitignore LICENSE README.md && git commit -m "chore: repo skeleton"
git add contracts/foundry.toml contracts/remappings.txt contracts/src && git commit -m "feat(contracts): SettleOnce at-most-once USDC settlement"
git add contracts/test && git commit -m "test(contracts): duplicate, conflict, rollback, fuzz and invariant tests"
git add contracts/script deployments && git commit -m "feat(contracts): Arc deploy script"
git add web/package.json web/package-lock.json web/tsconfig.json web/next.config.mjs web/next-env.d.ts web/vitest.config.ts web/.env.example web/src/config web/src/abi && git commit -m "feat(web): Next.js app with Arc chain config"
git add web/src/lib && git commit -m "feat(web): invoice keys, CSV import/export, USDC units"
git add web/src/hooks web/src/components web/src/app && git commit -m "feat(web): desk, pay flow, crash recovery, receipt and ledger"
git add docs examples ROADMAP.md .github && git commit -m "docs: deploy guide, guarantee, verification; CI"
```

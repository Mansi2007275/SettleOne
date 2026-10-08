# Verification record

Record only what actually happened. Keep local results, testnet results and mainnet results separate.

## 1. Contract tests (local EVM)

Run on 8 Oct 2026 with Foundry `forge 1.7.1` (standard EVM), solc 0.8.30:

```
Ran 25 tests for test/SettleOnce.t.sol:SettleOnceTest       25 passed
Ran 2 tests for test/SettleOnce.invariant.t.sol:SettleOnceInvariantTest
  invariant_atMostOneSettlementPerPayerAndKey (runs: 256, calls: 16384)   passed
  invariant_balancesMatchSettlements          (runs: 256, calls: 16384)   passed
27 tests passed, 0 failed
```

Includes `testFuzz_atMostOnce` (1,000 runs).

**To do on your machine:** `arc-forge test --network arc -vv` (Arc runtime). Result: _fill in_

## 2. Web unit tests

`npm test` in `web/`: 10 passed (key matches Solidity, normalization, units, CSV round-trip, reorder, duplicates, conflicts).

## 3. Local end-to-end run (simulated Arc, not the real network)

On 8 Oct 2026 the full browser flow was exercised against a **local anvil node** set up to look like Arc Testnet to the app: chain id `5042002`, a 6-decimal test token placed at the USDC address `0x3600…0000`, and a Multicall3-compatible contract at `0xcA11…CA11` (real Arc has Multicall3 there). The deploy script was the real `DeploySettleOnce.s.sol`. The browser was headless Chromium with an injected test wallet. 16/16 checks passed:

- three invoices added from the form; a malformed address is rejected
- connecting reads the chain: unpaid invoices show *Needs approval*
- approve + pay moves exactly 0.10 to the recipient; ticket shows *Paid*
- crash test armed → paying the second invoice reloads the app with an empty desk; the payment still lands on chain
- loading the saved CSV restores both as *Paid* from the chain; the third stays unpaid
- a fresh `payOnce` for a paid key, with unlimited allowance, reverts with `AlreadyPaid`
- the same references with a changed amount show *Conflict*
- receipt page shows the original transaction hash; reference check passes
- ledger lists both settlements
- no uncaught page errors

This proves the app logic, not Arc itself. Sections 4 and 5 are the real evidence.

## 4. Arc Testnet

| Item | Value |
|---|---|
| SettleOnce address | _fill in_ |
| Deployment tx | _fill in_ |
| Explorer verification | _link_ |
| Settlement tx (INV-1042, 0.10 USDC) | _fill in_ |
| Crash test → reload → recovered as Paid | yes / no |
| Conflict shown for changed amount | yes / no |

## 5. Arc mainnet

| Item | Value |
|---|---|
| SettleOnce address | _fill in_ |
| Deployment tx | _fill in_ |
| Source commit deployed | _git rev-parse HEAD_ |
| Real settlement tx | _fill in_ |
| Receipt page link | _fill in_ |

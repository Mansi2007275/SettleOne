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
| SettleOnce address | [`0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF`](https://explorer.testnet.arc.io/address/0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF) |
| Deployment tx | `0xf077427116885656dfc76ba2f52200ee81b0b5218129f564ce570e6e2ba64c75` (block 66160668) |
| Live app | https://settle-one-sandy.vercel.app |
| Example settlement (PIXELFORGE / PF-2026-101, 0.10 USDC) | [receipt](https://settle-one-sandy.vercel.app/receipt/0x71aEE14669EaF0a2f55b783Eed64Ad12B66177ee/0xf391e4ccfd177a9d34512ff814d14689f04d04e3ea24904c4e68899366e9d72e), block 66986131 |
| Scanned invoice paid (LUMEN DESIGN CO / LD-2026-044, 0.06 USDC) | block 67016112 |

## 5. Arc mainnet (14 Oct 2026)

| Item | Value |
|---|---|
| SettleOnce address | [`0x0D582d835E515CC0EC02C9b562F9120BF308CA2c`](https://explorer.arc.io/address/0x0D582d835E515CC0EC02C9b562F9120BF308CA2c?tab=contract) |
| Deployer | `0x075FF540a0F8e9340a4813EF96C609Dc203A3041` |
| Deployment tx | [`0x845e0f6625fc70777d86ead2820d30335fab1c52ed0647e8b99f553b23dfa49c`](https://explorer.arc.io/tx/0x845e0f6625fc70777d86ead2820d30335fab1c52ed0647e8b99f553b23dfa49c) (block 25798700, 821,140 gas, 0.0164 USDC) |
| Source verification | Exact match on explorer.arc.io — solc 0.8.30, optimizer 10,000 runs, EVM prague, MIT |
| Source commit deployed | `0f3a4c0` (contract unchanged since v0.1) |
| Live app | https://settle-one-mainnet.vercel.app |
| First real settlement (0.01 USDC through the live app) | [`0x65aca9ecb4eba41a301a52a536b455fa45d3b0a34fefdcb87e51182ab0aa63ef`](https://explorer.arc.io/tx/0x65aca9ecb4eba41a301a52a536b455fa45d3b0a34fefdcb87e51182ab0aa63ef) |
| Second attempt for the same invoice key refused | _fill in after testing_ |
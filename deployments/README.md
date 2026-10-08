# Deployments

`contracts/script/DeploySettleOnce.s.sol` writes one file per network here after a successful `--broadcast`:

- `arc-testnet.json`
- `arc-mainnet.json`

Each holds `network`, `chainId`, `settleOnce` (address), `usdc`, and `startBlock` (where the ledger starts scanning). Commit them: they are part of the public evidence.

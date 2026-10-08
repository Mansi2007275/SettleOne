# Deploy SettleOnce: Arc Testnet first, then mainnet

Network values below come from the Arc docs ([Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc), [Contract addresses](https://docs.arc.io/arc/references/contract-addresses)), checked 8 Oct 2026. Recheck them before mainnet.

| | Arc Testnet | Arc mainnet |
|---|---|---|
| Chain ID | `5042002` | `5042` |
| RPC | `https://rpc.testnet.arc.io` | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.testnet.arc.io` | `https://explorer.arc.io` |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` | same |
| Faucet | https://faucet.circle.com (pick Arc Testnet) | none, real USDC |

USDC is the gas token on Arc. Your wallet needs a little extra USDC beyond the invoice amounts.

---

## 0. One-time setup

**You need:** Node.js 20+, Git, a GitHub account, a Vercel account, MetaMask or Rabby.

**Arc Foundry** (`arc-forge`, `arc-cast`) runs on macOS, Linux, or **WSL on Windows**. On Windows, do the contract steps inside WSL (Ubuntu); the web steps work in PowerShell too.

1. Download the archive for your platform from https://github.com/circlefin/arc-foundry/releases (Windows: use the Linux x86_64 build inside WSL).
2. Install:
   ```bash
   tar -xzf arc-foundry-<version>-<target>.tar.gz
   mkdir -p ~/.local/bin
   mv forge ~/.local/bin/arc-forge
   mv cast  ~/.local/bin/arc-cast
   mv anvil ~/.local/bin/arc-anvil
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
   arc-forge --version
   ```

## 1. Put the code on GitHub

```bash
cd settleonce
git init -b main
git add .
git commit -m "chore: initial import"
# create an empty PUBLIC repo named settleonce on GitHub, then:
git remote add origin https://github.com/Mansi2007275/settleonce.git
git push -u origin main
```

(See [../ROADMAP.md](../ROADMAP.md) if you prefer committing in smaller steps.)

## 2. Contracts: install, test

```bash
cd contracts
arc-forge install foundry-rs/forge-std
arc-forge build
arc-forge test -vv                 # all tests must pass
arc-forge test --network arc -vv   # same suite on Arc's runtime rules
```

## 3. A deployer wallet (never your main wallet)

```bash
arc-cast wallet new                                         # prints an address + private key
arc-cast wallet import settleonce-deployer --interactive    # paste that private key, choose a password
arc-cast wallet address --account settleonce-deployer       # shows the address again
```

The key now lives in an encrypted keystore (`~/.foundry/keystores`). Nothing goes in `.env`, nothing gets committed.

Fund that address at https://faucet.circle.com → **Arc Testnet** → USDC.

## 4. Deploy to Arc Testnet

```bash
export DEPLOYER=$(arc-cast wallet address --account settleonce-deployer)

arc-forge script script/DeploySettleOnce.s.sol \
  --rpc-url arc_testnet \
  --account settleonce-deployer \
  --sender $DEPLOYER \
  --broadcast
```

The script refuses to run on anything but Arc, checks that USDC reports 6 decimals, deploys, writes `deployments/arc-testnet.json`, and prints three lines for the web app:

```
NEXT_PUBLIC_ARC_NETWORK=testnet
NEXT_PUBLIC_SETTLEONCE_ADDRESS=0x…
NEXT_PUBLIC_SETTLEONCE_START_BLOCK=…
```

### Verify the source on the explorer

```bash
arc-forge verify-contract <SETTLEONCE_ADDRESS> src/SettleOnce.sol:SettleOnce \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api/ \
  --constructor-args $(arc-cast abi-encode "constructor(address)" 0x3600000000000000000000000000000000000000)
```

### Sanity check from the terminal

```bash
arc-cast call <SETTLEONCE_ADDRESS> "usdc()(address)" --rpc-url arc_testnet
# → 0x3600000000000000000000000000000000000000
```

## 5. Run the web app locally

```bash
cd ../web
npm ci
cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
# paste the three NEXT_PUBLIC_ lines from step 4 into .env.local
npm test
npm run dev
```

Open http://localhost:3000, connect MetaMask, accept "Switch to Arc Testnet" (the app adds the network if needed). Use a payer wallet funded from the faucet; it can be the deployer or a separate wallet.

## 6. Testnet run-through (do all of it before mainnet)

1. Add an invoice: `VENDOR-7` / `INV-1042` / a second wallet you own / `0.10`.
2. **Save file.**
3. Pay it: approve 0.10, then pay. The ticket gets punched and stamped *Paid once*.
4. Open **View receipt**: amount, recipient, block and transaction should all match the explorer.
5. Add `INV-1043`, **Save file**, turn on **Crash test**, pay it. The app reloads with an empty desk.
6. **Load file**. Both invoices come back as *Paid*, read from the chain.
7. Edit the CSV so `INV-1042` says `0.20`, load it: the ticket shows *Conflict*.
8. Open **Ledger**: both settlements are listed.

Write what you saw (addresses, tx hashes) into [VERIFICATION.md](VERIFICATION.md).

## 7. Deploy the site on Vercel

1. vercel.com → **Add New → Project** → import your `settleonce` GitHub repo.
2. **Root Directory:** `web`. Framework preset: Next.js (auto-detected).
3. **Environment Variables:** add the three `NEXT_PUBLIC_…` values from step 4 (optionally `NEXT_PUBLIC_ARC_RPC_URL` for your own RPC).
4. **Deploy.** Every push to `main` redeploys.

`NEXT_PUBLIC_` values are baked in at build time. After changing one in Vercel, redeploy.

## 8. Mainnet (only after step 6 passes)

You need real USDC on Arc mainnet in both the deployer and the payer wallet (a few USDC is plenty for deployment plus tiny demo payments).

```bash
cd contracts
arc-forge script script/DeploySettleOnce.s.sol \
  --rpc-url arc_mainnet \
  --account settleonce-deployer \
  --sender $DEPLOYER \
  --broadcast

arc-forge verify-contract <MAINNET_ADDRESS> src/SettleOnce.sol:SettleOnce \
  --chain-id 5042 \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api/ \
  --constructor-args $(arc-cast abi-encode "constructor(address)" 0x3600000000000000000000000000000000000000)
```

Then in Vercel set `NEXT_PUBLIC_ARC_NETWORK=mainnet`, the mainnet address and start block, and redeploy. (Or keep the testnet site and create a second Vercel project for mainnet.) Repeat the run-through with tiny amounts between wallets you control, and put the mainnet address and a real settlement transaction at the top of the README.

## Troubleshooting

- **"Wallet on another network"**: click *Switch to Arc Testnet*; the app asks your wallet to add/switch.
- **Transaction never appears**: Arc's mempool drops transactions with `maxFeePerGas` under 20 gwei. MetaMask normally sets enough; if you edited gas manually, raise it.
- **"Status unavailable"**: the RPC didn't answer. The app never guesses "unpaid"; click *Check again* or set `NEXT_PUBLIC_ARC_RPC_URL` to another Arc RPC (Blockdaemon, dRPC, QuickNode, Alchemy).
- **Ledger shows nothing**: check `NEXT_PUBLIC_SETTLEONCE_START_BLOCK`; the scan stops at that block.
- **Local node**: `NEXT_PUBLIC_ARC_RPC_URL=http://127.0.0.1:8545` is accepted, for testing against `arc-anvil --network arc` (which can fork Arc Testnet state). Only `localhost`/`127.0.0.1` may use plain http.

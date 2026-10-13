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

**Arc Foundry** (`arc-forge`, `arc-cast`) runs on macOS, Linux, or **WSL on Windows**. On Windows, do the contract steps inside WSL (Ubuntu); the web steps work in PowerShell too. For the mainnet deploy there is also an all-PowerShell route with Foundry from npm — see [8.1](#81-foundry-from-npm).

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

Every command below moves or verifies **real USDC**. Read the whole section first and run nothing until step 6 passed in full. You need real USDC on Arc mainnet in both the deployer and the payer wallet (a few USDC is plenty for deployment plus tiny real payments).

Written for **Windows PowerShell** with Foundry installed from npm, so the binaries are plain `forge` and `cast`. The mainnet keystore account is called `mansi-mainnet` and is separate from the testnet one.

### 8.1 Foundry from npm

```powershell
npm install --global @foundry-rs/forge @foundry-rs/cast
forge --version
cast --version
```

Arc's own build (`arc-forge`, `arc-cast`) stays what you use for `arc-forge test --network arc` in step 2 — it is the one that applies Arc's runtime rules to the test suite. The npm binaries are for deploying and verifying.

### 8.2 A mainnet keystore account

```powershell
cast wallet new
cast wallet import mansi-mainnet --interactive
cast wallet address --account mansi-mainnet
```

`cast wallet new` prints an address and a private key; `cast wallet import` takes that key and a password and writes an encrypted keystore to `$env:USERPROFILE\.foundry\keystores`. Nothing goes in `.env`, nothing gets committed. Fund the printed address with real USDC.

Keep the address in the session so the deploy line can use it:

```powershell
$env:DEPLOYER = cast wallet address --account mansi-mainnet
```

### 8.3 Deploy

```powershell
cd contracts
forge script script/DeploySettleOnce.s.sol --rpc-url arc_mainnet --account mansi-mainnet --sender $env:DEPLOYER --broadcast
```

PowerShell has no `\` line continuation, so each command is one line here. The script refuses to run on anything but Arc, checks that USDC reports 6 decimals, writes `deployments/arc-mainnet.json`, and prints the three `NEXT_PUBLIC_` lines.

### 8.4 Verify the source on the explorer

```powershell
$ctorArgs = cast abi-encode "constructor(address)" 0x3600000000000000000000000000000000000000
forge verify-contract <MAINNET_ADDRESS> src/SettleOnce.sol:SettleOnce --chain-id 5042 --verifier blockscout --verifier-url https://explorer.arc.io/api/ --constructor-args $ctorArgs
```

(`$ctorArgs`, not `$args` — `$args` is a PowerShell automatic variable.)

### 8.5 Sanity check from the terminal

```powershell
cast call <MAINNET_ADDRESS> "usdc()(address)" --rpc-url arc_mainnet
# -> 0x3600000000000000000000000000000000000000
```

### 8.6 Point the site at mainnet

In Vercel set the three values and redeploy (or keep the testnet site and create a second Vercel project for mainnet):

```
NEXT_PUBLIC_ARC_NETWORK=mainnet
NEXT_PUBLIC_SETTLEONCE_ADDRESS=0x…
NEXT_PUBLIC_SETTLEONCE_START_BLOCK=…
```

To see the mainnet build locally before you push it:

```powershell
cd ..\web
$env:NEXT_PUBLIC_ARC_NETWORK = "mainnet"
$env:NEXT_PUBLIC_SETTLEONCE_ADDRESS = "0x…"
$env:NEXT_PUBLIC_SETTLEONCE_START_BLOCK = "…"
npm run build
npm start
```

`NEXT_PUBLIC_` values are baked in at build time, in Vercel and here both.

### 8.7 What the mainnet build does differently

With `NEXT_PUBLIC_ARC_NETWORK=mainnet`, and only then:

- **A banner that never goes away** in the header: *Arc mainnet · real USDC*.
- **A confirmation before every payment** — the single `payOnce` and the one-signature approve-and-pay batch alike. It shows the amount, the full recipient address in groups of four, the vendor and invoice references, and *This cannot be undone*. Esc or **Cancel** sends nothing.
- **No demo invoice and no crash test.** Both would spend or throw away real work. They come back only with `?demo=1` in the URL, for a deliberate demo: `https://<your-deployment>/?demo=1`.
- The faucet link under a short balance is gone — there is no mainnet faucet.

Radar and `/api/paid` read whichever network is configured, so on a mainnet build both are mainnet. Nothing above changes testnet behaviour.

### 8.8 Repeat the run-through

Repeat step 6 with tiny amounts between wallets you control, then put the mainnet address and a real settlement transaction at the top of the README and in [VERIFICATION.md](VERIFICATION.md).

## Troubleshooting

- **"Wallet on another network"**: click *Switch to Arc Testnet*; the app asks your wallet to add/switch.
- **Transaction never appears**: Arc's mempool drops transactions with `maxFeePerGas` under 20 gwei. MetaMask normally sets enough; if you edited gas manually, raise it.
- **"Status unavailable"**: the RPC didn't answer. The app never guesses "unpaid"; click *Check again* or set `NEXT_PUBLIC_ARC_RPC_URL` to another Arc RPC (Blockdaemon, dRPC, QuickNode, Alchemy).
- **Ledger shows nothing**: check `NEXT_PUBLIC_SETTLEONCE_START_BLOCK`; the scan stops at that block.
- **Local node**: `NEXT_PUBLIC_ARC_RPC_URL=http://127.0.0.1:8545` is accepted, for testing against `arc-anvil --network arc` (which can fork Arc Testnet state). Only `localhost`/`127.0.0.1` may use plain http.

import { defineChain, type Address, type Chain, type Hex } from "viem";

/**
 * Arc chain definitions, taken from https://docs.arc.io/arc/references/connect-to-arc
 * (checked 8 Oct 2026). Defined here rather than imported from `viem/chains` because the viem
 * version this package pins still ships older testnet RPC and explorer hosts.
 *
 * Native USDC uses 18 decimals and pays for gas. Invoice amounts always use the USDC ERC-20
 * interface below (6 decimals). One asset, two interfaces.
 */
export const arcTestnet: Chain = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"], webSocket: ["wss://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

export const arcMainnet: Chain = defineChain({
  id: 5_042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export type ArcNetwork = "testnet" | "mainnet";

export const CHAINS: Record<ArcNetwork, Chain> = { testnet: arcTestnet, mainnet: arcMainnet };

/** Arc's USDC ERC-20 interface. Same address on testnet and mainnet. */
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

/**
 * Arc rejects transactions below 20 gwei, so every write this package sends is floored there.
 * An estimate above the floor is used as it comes back.
 */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n;

export function arcChain(network: ArcNetwork): Chain {
  const chain = CHAINS[network];
  if (!chain) throw new Error(`Unknown Arc network "${String(network)}". Use "testnet" or "mainnet".`);
  return chain;
}

export function explorerUrl(chain: Chain): string {
  return chain.blockExplorers?.default.url ?? "";
}

/** Explorer link for a transaction, or an empty string when the chain has no explorer. */
export function txUrl(chain: Chain, hash: Hex): string {
  const base = explorerUrl(chain);
  return base ? `${base}/tx/${hash}` : "";
}

export function addressUrl(chain: Chain, address: Address): string {
  const base = explorerUrl(chain);
  return base ? `${base}/address/${address}` : "";
}

/** Explorer link for the block a settlement was recorded in. */
export function blockUrl(chain: Chain, block: bigint | number): string {
  const base = explorerUrl(chain);
  return base ? `${base}/block/${block.toString()}` : "";
}

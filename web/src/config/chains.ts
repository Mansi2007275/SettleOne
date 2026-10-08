import { defineChain } from "viem";

/**
 * Arc chain definitions, taken from https://docs.arc.io/arc/references/connect-to-arc
 * (checked 8 Oct 2026). Defined here instead of importing from `viem/chains` because the
 * viem build we pin still ships older testnet RPC and explorer hosts.
 *
 * Native USDC uses 18 decimals and pays for gas. Business amounts in this app always use the
 * USDC ERC-20 interface (6 decimals). They are one balance, never shown as two.
 */
export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.io"],
      webSocket: ["wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 },
  },
  testnet: true,
});

export const arcMainnet = defineChain({
  id: 5_042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 },
  },
});

export type ArcNetwork = "testnet" | "mainnet";

export const CHAINS = { testnet: arcTestnet, mainnet: arcMainnet } as const;

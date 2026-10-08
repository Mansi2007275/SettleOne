import { getAddress, isAddress, type Address } from "viem";
import { CHAINS, type ArcNetwork } from "./chains";

/**
 * Public runtime configuration. Next.js only inlines NEXT_PUBLIC_* values that are referenced
 * literally, so each one is read by name below.
 */
const rawNetwork = process.env.NEXT_PUBLIC_ARC_NETWORK;
const rawAddress = process.env.NEXT_PUBLIC_SETTLEONCE_ADDRESS;
const rawStartBlock = process.env.NEXT_PUBLIC_SETTLEONCE_START_BLOCK;
const rawRpc = process.env.NEXT_PUBLIC_ARC_RPC_URL;

export const network: ArcNetwork = rawNetwork === "mainnet" ? "mainnet" : "testnet";

export const chain = CHAINS[network];

/** https RPCs anywhere; plain http only for a local node (arc-anvil) during development. */
const isUsableRpc = (url: string) =>
  url.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);

export const rpcUrl: string = rawRpc && isUsableRpc(rawRpc) ? rawRpc : chain.rpcUrls.default.http[0]!;

/** Arc's USDC ERC-20 interface (6 decimals). Same address on testnet and mainnet. */
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

export const settleOnceAddress: Address | null =
  rawAddress && isAddress(rawAddress, { strict: false }) ? getAddress(rawAddress) : null;

export const startBlock: bigint = (() => {
  if (!rawStartBlock || !/^\d+$/.test(rawStartBlock)) return 0n;
  return BigInt(rawStartBlock);
})();

/** Problems that stop the app from talking to a real contract. Shown on screen, never hidden. */
export const configProblems: string[] = (() => {
  const problems: string[] = [];
  if (!rawAddress) problems.push("NEXT_PUBLIC_SETTLEONCE_ADDRESS is not set.");
  else if (!settleOnceAddress) problems.push(`NEXT_PUBLIC_SETTLEONCE_ADDRESS "${rawAddress}" is not an address.`);
  if (rawNetwork && rawNetwork !== "testnet" && rawNetwork !== "mainnet") {
    problems.push(`NEXT_PUBLIC_ARC_NETWORK must be "testnet" or "mainnet" (got "${rawNetwork}").`);
  }
  return problems;
})();

export const explorerUrl = chain.blockExplorers.default.url;

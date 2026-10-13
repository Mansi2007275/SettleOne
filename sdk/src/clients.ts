import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcChain, type ArcNetwork } from "./chains.ts";
import { SettleOnceError } from "./errors.ts";

/**
 * The two clients `payOnce` needs, pointed at Arc.
 *
 * The private key is turned into a local account and never leaves this process: it is not logged,
 * not returned, and not part of any error message this package throws.
 */
export type ArcClients = {
  chain: Chain;
  account: Account;
  publicClient: PublicClient;
  walletClient: WalletClient;
};

export function createArcClients({
  network,
  privateKey,
  rpcUrl,
}: {
  network: ArcNetwork;
  /** 0x-prefixed 32-byte key. Read it from the environment, never from source. */
  privateKey: string;
  /** Overrides the chain's default RPC. */
  rpcUrl?: string;
}): ArcClients {
  const chain = arcChain(network);
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? "")) {
    // Deliberately says nothing about the value it was given.
    throw new SettleOnceError("no-account", "PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(rpcUrl && rpcUrl.trim() !== "" ? rpcUrl.trim() : undefined, { retryCount: 2 });

  return {
    chain,
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport, account }),
  };
}

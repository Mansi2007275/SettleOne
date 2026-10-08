import { createConfig, http, injected } from "wagmi";
import { arcMainnet, arcTestnet } from "./chains";
import { chain, network, rpcUrl } from "./env";

const transportOptions = { batch: { wait: 16 }, retryCount: 2 } as const;

/**
 * One network per deployment: the build targets either Arc Testnet or Arc mainnet, never both,
 * so a payment can't accidentally go to the wrong chain. (Both transports are declared only to
 * satisfy the types; only `chain` is registered.)
 *
 * Browser wallets are discovered through EIP-6963 (MetaMask, Rabby, Coinbase, OKX…), with the
 * generic injected provider as a fallback.
 */
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  transports: {
    [arcTestnet.id]: http(network === "testnet" ? rpcUrl : arcTestnet.rpcUrls.default.http[0], transportOptions),
    [arcMainnet.id]: http(network === "mainnet" ? rpcUrl : arcMainnet.rpcUrls.default.http[0], transportOptions),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

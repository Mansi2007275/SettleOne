"use client";

import { useAccount, useBlockNumber } from "wagmi";
import { chain, network } from "@/config/env";
import { useMounted } from "@/hooks/useMounted";
import styles from "./Wallet.module.css";

/** Shows which Arc network this build pays on, and whether the RPC is answering. */
export function NetworkBadge() {
  const mounted = useMounted();
  const { chainId, isConnected } = useAccount();
  const block = useBlockNumber({ chainId: chain.id, watch: { enabled: true, pollingInterval: 4_000 } });

  const live = mounted && block.data !== undefined && !block.isError;
  const mismatch = mounted && isConnected && chainId !== chain.id;

  return (
    <span
      className={styles.network}
      data-network={network}
      data-state={mismatch ? "mismatch" : live ? "live" : "down"}
      title={
        live
          ? `${chain.name} is answering. Latest block ${block.data?.toString()}`
          : `Can't reach ${chain.name} right now`
      }
    >
      <span className={styles.networkDot} aria-hidden="true" />
      {chain.name}
      {mismatch ? <span className={styles.networkWarn}>wallet elsewhere</span> : null}
    </span>
  );
}

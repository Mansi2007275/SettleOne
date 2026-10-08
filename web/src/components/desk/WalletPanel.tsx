"use client";

import { useAccount } from "wagmi";
import { chain, network } from "@/config/env";
import { useMounted } from "@/hooks/useMounted";
import { formatUsdc } from "@/lib/usdc";
import styles from "./Bench.module.css";

export function WalletPanel({ balance, loading, error }: { balance?: bigint; loading: boolean; error: boolean }) {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();

  return (
    <section className={`panel ${styles.wallet}`} aria-label="Paying wallet">
      <h2>Paying wallet</h2>
      {!mounted || !isConnected || !address ? (
        <p className="panel-note">Connect the wallet you pay invoices from. Paid status is tracked per wallet.</p>
      ) : chainId !== chain.id ? (
        <p className="panel-note">Your wallet is on another network. Switch to {chain.name} to read balances.</p>
      ) : (
        <>
          <p className={styles.balance}>
            <span className="mono">{error ? "—" : loading || balance === undefined ? "…" : formatUsdc(balance)}</span>
            <span>USDC</span>
          </p>
          <p className="panel-note">
            {error ? "Couldn't read the balance right now. " : ""}Gas on Arc is paid from this same USDC balance, so keep a
            little extra.
            {network === "testnet" ? (
              <>
                {" "}
                Need test USDC?{" "}
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                  Circle faucet
                </a>
                .
              </>
            ) : null}
          </p>
        </>
      )}
    </section>
  );
}

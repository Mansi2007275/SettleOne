"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { chain } from "@/config/env";
import { useMounted } from "@/hooks/useMounted";
import { explainError } from "@/lib/errors";
import { addressUrl, shortHex } from "@/lib/explorer";
import styles from "./Wallet.module.css";

export function WalletButton() {
  const mounted = useMounted();
  const { address, isConnected, chainId, status } = useAccount();
  const { connectors, connect, isPending, error: connectError, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted || status === "reconnecting") {
    return (
      <button className="btn btn-small" disabled>
        Wallet…
      </button>
    );
  }

  // EIP-6963 wallets announce themselves; the generic "Injected" entry is only a fallback.
  const discovered = connectors.filter((c) => c.id !== "injected");
  const options = discovered.length > 0 ? discovered : connectors;
  const hasWallet = typeof window !== "undefined" && ("ethereum" in window || discovered.length > 0);

  if (!isConnected || !address) {
    return (
      <div className={styles.wrap} ref={wrapRef}>
        <button
          className="btn btn-signal btn-small"
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={isPending}
          onClick={() => {
            reset();
            if (options.length === 1 && hasWallet) connect({ connector: options[0]!, chainId: chain.id });
            else setOpen((v) => !v);
          }}
        >
          {isPending ? "Check your wallet…" : "Connect wallet"}
        </button>
        {open ? (
          <div className={styles.menu} role="menu">
            {hasWallet ? (
              options.map((c) => (
                <button
                  key={c.uid}
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    setOpen(false);
                    connect({ connector: c, chainId: chain.id });
                  }}
                >
                  {c.icon ? <img src={c.icon} alt="" width={20} height={20} /> : null}
                  {c.name}
                </button>
              ))
            ) : (
              <p className={styles.menuNote}>
                No browser wallet found. Install{" "}
                <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                  MetaMask
                </a>{" "}
                or{" "}
                <a href="https://rabby.io/" target="_blank" rel="noreferrer">
                  Rabby
                </a>
                , then reload.
              </p>
            )}
          </div>
        ) : null}
        {connectError ? (
          <p className={styles.inlineError} role="alert">
            {explainError(connectError)}
          </p>
        ) : null}
      </div>
    );
  }

  if (chainId !== chain.id) {
    return (
      <div className={styles.wrap}>
        <button
          className="btn btn-small"
          style={{ ["--btn-bg" as string]: "var(--highlighter)" }}
          disabled={switching}
          onClick={() => switchChain({ chainId: chain.id })}
        >
          {switching ? "Switching…" : `Switch to ${chain.name}`}
        </button>
        {switchError ? (
          <p className={styles.inlineError} role="alert">
            {explainError(switchError)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`btn btn-small ${styles.addressButton}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.connectedDot} aria-hidden="true" />
        <span className="mono">{shortHex(address)}</span>
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <p className={`mono ${styles.menuAddress}`}>{address}</p>
          <button
            role="menuitem"
            className={styles.menuItem}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard blocked */
              }
            }}
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <a role="menuitem" className={styles.menuItem} href={addressUrl(address)} target="_blank" rel="noreferrer">
            View on explorer
          </a>
          <button
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

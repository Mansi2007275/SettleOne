"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useAccount } from "wagmi";
import { chain } from "@/config/env";
import { useDuplicateScan } from "@/hooks/useDuplicateScan";
import {
  DEFAULT_RANGE,
  DEFAULT_WINDOW,
  RANGE_OPTIONS,
  WINDOW_OPTIONS,
  type DuplicateGroup,
  type RangeId,
  type WindowId,
} from "@/lib/duplicateRadar";
import { addressUrl, shortHex, txUrl } from "@/lib/explorer";
import { formatUsdc } from "@/lib/usdc";
import styles from "./Radar.module.css";

/**
 * "Did this wallet ever pay twice?"
 *
 * Reads plain USDC transfer logs for any address, so it sees payments that never went through
 * SettleOnce — which is the point: it shows the problem on a wallet's real history. Everything it
 * finds is called *suspected*, because two identical payments to one vendor can be perfectly
 * legitimate and no outsider can tell from the chain alone.
 */
export function RadarScreen() {
  const id = useId();
  const { address: connected } = useAccount();
  const scan = useDuplicateScan();

  const [input, setInput] = useState("");
  const [window, setWindow] = useState<WindowId>(DEFAULT_WINDOW);
  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);

  // Prefill the connected wallet, but never overwrite something the reader typed.
  useEffect(() => {
    if (connected) setInput((current) => (current === "" ? connected : current));
  }, [connected]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!isAddress(value, { strict: false })) {
      setError("Enter a wallet address (0x followed by 40 hex characters).");
      return;
    }
    setError(null);
    const address = getAddress(value);
    setScanned(address);
    void scan.scan({ address, window, range });
  };

  const changeWindow = (next: WindowId) => {
    setWindow(next);
    scan.setWindow(next);
  };

  const { summary } = scan;
  const showResults = scan.finished && !scan.error;

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <p className={styles.kicker}>Duplicate radar</p>
        <h1 className={styles.title}>Did this wallet ever pay twice?</h1>
        <p className={styles.lede}>
          Paste any address and this page reads its USDC transfers on {chain.name} straight from the chain, then looks
          for the same amount landing at the same recipient twice in a short window. Nothing is uploaded, no wallet is
          needed, and SettleOnce is not involved: these are plain transfers, the way most invoices are paid today.
        </p>
      </header>

      <form className={`panel ${styles.controls}`} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>Scan a wallet</h2>

        <div className="field">
          <label htmlFor={`${id}-address`}>Wallet address</label>
          <input
            id={`${id}-address`}
            className="mono-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>

        <div className={styles.selects}>
          <div className="field">
            <label htmlFor={`${id}-window`}>Duplicate window</label>
            <select
              id={`${id}-window`}
              className={styles.select}
              value={window}
              onChange={(e) => changeWindow(e.target.value as WindowId)}
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`${id}-range`}>How far back</label>
            <select
              id={`${id}-range`}
              className={styles.select}
              value={range}
              onChange={(e) => setRange(e.target.value as RangeId)}
              disabled={scan.running}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <p id={`${id}-error`} className="field-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button className="btn btn-signal" type="submit" disabled={scan.running || !scan.ready}>
            {scan.running ? "Scanning…" : "Scan for duplicates"}
          </button>
          {scan.running ? (
            <button className="btn" type="button" onClick={scan.stop}>
              Stop
            </button>
          ) : null}
        </div>

        <p className={styles.progress} role="status">
          {scan.running || scan.finished
            ? `Scanned ${scan.scannedBlocks.toString()} blocks${
                scan.totalBlocks > 0n ? ` of ${scan.totalBlocks.toString()}` : ""
              } · ${scan.transferCount} transfer${scan.transferCount === 1 ? "" : "s"} found`
            : "Nothing scanned yet."}
        </p>
      </form>

      {scan.error ? (
        <p className={styles.error} role="alert">
          Couldn&apos;t finish the scan: {scan.error}
        </p>
      ) : null}

      {showResults ? (
        <section className={styles.results} aria-labelledby="radar-results-title">
          <h2 id="radar-results-title" className={styles.resultsTitle}>
            {summary.extraCount === 0 ? (
              "No suspected duplicates found in the scanned range."
            ) : (
              <>
                {summary.extraCount} suspected duplicate payment{summary.extraCount === 1 ? "" : "s"}
                <span className={styles.sep} aria-hidden="true">
                  {" · "}
                </span>
                <span className="mono">{formatUsdc(summary.extraTotal)}</span> USDC
              </>
            )}
          </h2>

          {summary.extraCount > 0 ? (
            <p className={styles.caveat}>
              Suspected — these could be legitimate repeat payments (a retainer, two identical invoices from one
              vendor). The chain can&apos;t tell the difference, so check them against your own records.
            </p>
          ) : (
            <p className={styles.caveat}>
              {scanned ? `${shortHex(scanned)} sent ` : "This wallet sent "}
              {summary.transferCount} USDC transfer{summary.transferCount === 1 ? "" : "s"} in the blocks scanned
              {scan.range ? ` (${scan.range.from.toString()}–${scan.range.to.toString()})` : ""}. Widen the window or
              the range to look further.
            </p>
          )}

          <ol className={styles.groups}>
            {scan.groups.map((group) => (
              <Group key={group.id} group={group} />
            ))}
          </ol>
        </section>
      ) : null}

      <section className={styles.pitch} aria-labelledby="radar-pitch-title">
        <h2 id="radar-pitch-title">SettleOnce would have blocked these</h2>
        <p>Each invoice gets one key, one payment. The contract refuses the second one.</p>
        <p className={styles.pitchNote}>
          The key comes from the invoice&apos;s own references, so the guard holds across a crashed tab, a new device
          or a retrying script — and a changed recipient under a paid key is rejected rather than paid as something new.
        </p>
        <Link className="btn btn-signal" href="/">
          Start on the desk
        </Link>
      </section>
    </div>
  );
}

function Group({ group }: { group: DuplicateGroup }) {
  return (
    <li className={styles.group}>
      <div className={styles.groupHead}>
        <p className={styles.groupAmount}>
          <span className="mono">{formatUsdc(group.value)}</span> USDC
        </p>
        <p className={styles.groupTo}>
          to{" "}
          <a className="mono" href={addressUrl(group.recipient)} target="_blank" rel="noreferrer" title={group.recipient}>
            {shortHex(group.recipient)}
          </a>
        </p>
        <p className={styles.groupCount}>
          paid {group.transfers.length} times
          <span className={styles.groupExtra}>
            {" "}
            · {group.extraCount} suspected duplicate{group.extraCount === 1 ? "" : "s"}
          </span>
        </p>
      </div>

      <ol className={styles.txs}>
        {group.transfers.map((transfer, i) => (
          <li key={`${transfer.txHash}-${transfer.logIndex}`} className={styles.tx}>
            <span className={styles.txTag}>{i === 0 ? "First" : `Repeat ${i}`}</span>
            <time className={styles.txTime} dateTime={new Date(Number(transfer.timestamp) * 1000).toISOString()}>
              {new Date(Number(transfer.timestamp) * 1000).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
            <a className={`mono ${styles.txLink}`} href={txUrl(transfer.txHash)} target="_blank" rel="noreferrer">
              {shortHex(transfer.txHash, 10, 6)}
            </a>
          </li>
        ))}
      </ol>
    </li>
  );
}

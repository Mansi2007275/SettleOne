"use client";

import Link from "next/link";
import { chain, configProblems, settleOnceAddress, startBlock } from "@/config/env";
import { useLedger } from "@/hooks/useLedger";
import { addressUrl, shortHex, txUrl } from "@/lib/explorer";
import { formatUsdc } from "@/lib/usdc";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { LookupForm } from "./LookupForm";
import styles from "./Ledger.module.css";

export function LedgerScreen() {
  const ledger = useLedger();

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1>Ledger</h1>
        <p>
          Every <span className="mono">InvoicePaid</span> event from the SettleOnce contract on {chain.name}, newest
          first, read straight from the chain. No wallet needed.
        </p>
      </header>

      <SetupNotice problems={configProblems} />

      <div className={styles.grid}>
        <LookupForm />

        <section className={styles.feed} aria-labelledby="feed-title">
          <div className={styles.feedHead}>
            <h2 id="feed-title">Recent settlements</h2>
            <button className="btn btn-ghost btn-small" onClick={() => void ledger.refresh()} disabled={ledger.loading || !settleOnceAddress}>
              {ledger.loading ? "Reading…" : "Refresh"}
            </button>
          </div>

          {ledger.error ? (
            <p className={styles.error} role="alert">
              Couldn&apos;t read the ledger: {ledger.error}
            </p>
          ) : null}

          {ledger.entries.length === 0 && !ledger.loading && !ledger.error && settleOnceAddress ? (
            <p className={styles.empty}>
              No settlements found in the blocks scanned so far
              {ledger.scannedDownTo !== null && ledger.latest !== null
                ? ` (${(ledger.scannedDownTo + 1n).toString()} to ${ledger.latest.toString()})`
                : ""}
              .
            </p>
          ) : null}

          <ol className={styles.list}>
            {ledger.entries.map((e) => (
              <li key={`${e.txHash}-${e.logIndex}`} className={styles.row}>
                <p className={styles.rowAmount}>
                  <span className="mono">{formatUsdc(e.amount)}</span> USDC
                </p>
                <dl className={styles.rowMeta}>
                  <div>
                    <dt>From</dt>
                    <dd className="mono">
                      <a href={addressUrl(e.payer)} target="_blank" rel="noreferrer" title={e.payer}>
                        {shortHex(e.payer)}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>To</dt>
                    <dd className="mono">
                      <a href={addressUrl(e.recipient)} target="_blank" rel="noreferrer" title={e.recipient}>
                        {shortHex(e.recipient)}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Key</dt>
                    <dd className="mono" title={e.invoiceKey}>
                      {shortHex(e.invoiceKey, 8, 6)}
                    </dd>
                  </div>
                  <div>
                    <dt>Block</dt>
                    <dd className="mono">{e.blockNumber.toString()}</dd>
                  </div>
                </dl>
                <div className={styles.rowLinks}>
                  <Link href={`/receipt/${e.payer}/${e.invoiceKey}`}>Receipt</Link>
                  <a href={txUrl(e.txHash)} target="_blank" rel="noreferrer">
                    Transaction
                  </a>
                </div>
              </li>
            ))}
          </ol>

          {settleOnceAddress && !ledger.done && ledger.scannedDownTo !== null ? (
            <button className="btn btn-small" onClick={() => void ledger.loadOlder()} disabled={ledger.loading}>
              {ledger.loading ? "Reading…" : `Load older (scanned down to block ${(ledger.scannedDownTo + 1n).toString()})`}
            </button>
          ) : null}
          {ledger.done ? (
            <p className={styles.empty}>Reached the deployment block ({startBlock.toString()}). That&apos;s everything.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

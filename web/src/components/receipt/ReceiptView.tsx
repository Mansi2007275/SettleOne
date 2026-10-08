"use client";

import Link from "next/link";
import type { Address, Hex } from "viem";
import { useReadContract } from "wagmi";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, configProblems, settleOnceAddress } from "@/config/env";
import { useSettlementTx } from "@/hooks/useSettlementTx";
import { explainError } from "@/lib/errors";
import { addressUrl, blockUrl, txUrl } from "@/lib/explorer";
import { deriveInvoiceKey, normalizeRef } from "@/lib/invoice";
import { formatUsdc } from "@/lib/usdc";
import { SetupNotice } from "@/components/layout/SetupNotice";
import styles from "./Receipt.module.css";

export function ReceiptView({
  payer,
  invoiceKey,
  claimedRefs,
}: {
  payer: Address;
  invoiceKey: Hex;
  claimedRefs: { vendorRef: string; invoiceRef: string } | null;
}) {
  const read = useReadContract({
    address: settleOnceAddress ?? undefined,
    abi: settleOnceAbi,
    functionName: "receiptFor",
    args: [payer, invoiceKey],
    chainId: chain.id,
    query: { enabled: !!settleOnceAddress },
  });

  const s = read.data;
  const paid = !!s && s.paidAtBlock !== 0n;
  const tx = useSettlementTx(payer, invoiceKey, paid ? s!.paidAtBlock : undefined);

  const refsMatch = claimedRefs ? deriveInvoiceKey(claimedRefs.vendorRef, claimedRefs.invoiceRef) === invoiceKey : null;

  const paidAt = paid
    ? new Date(Number(s!.paidAt) * 1000).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className={`shell ${styles.page}`}>
      <SetupNotice problems={configProblems} />

      <article className={styles.slip} aria-labelledby="receipt-title" data-state={paid ? "paid" : "open"}>
        <header className={styles.head}>
          <h1 id="receipt-title">Settlement receipt</h1>
          <p>{chain.name}</p>
        </header>

        {claimedRefs ? (
          <p className={styles.refs}>
            {normalizeRef(claimedRefs.vendorRef)} / {normalizeRef(claimedRefs.invoiceRef)}
            <span data-ok={refsMatch ? "yes" : "no"}>
              {refsMatch ? "references match this key" : "these references don't match this key"}
            </span>
          </p>
        ) : null}

        <dl className={styles.lines}>
          <Line label="Invoice key" mono>
            {invoiceKey}
          </Line>
          <Line label="Payer" mono>
            <a href={addressUrl(payer)} target="_blank" rel="noreferrer">
              {payer}
            </a>
          </Line>

          {read.isPending && settleOnceAddress ? <Line label="Status">Reading the contract…</Line> : null}
          {read.isError ? <Line label="Status">Couldn&apos;t read the contract: {explainError(read.error)}</Line> : null}

          {s && !paid ? (
            <Line label="Status">
              No settlement on record for this payer and key. Nothing has been paid through SettleOnce for it.
            </Line>
          ) : null}

          {paid ? (
            <>
              <Line label="Paid to" mono>
                <a href={addressUrl(s!.recipient)} target="_blank" rel="noreferrer">
                  {s!.recipient}
                </a>
              </Line>
              <Line label="Amount" mono>
                <strong className={styles.amount}>{formatUsdc(s!.amount)} USDC</strong>
              </Line>
              <Line label="Block" mono>
                <a href={blockUrl(s!.paidAtBlock)} target="_blank" rel="noreferrer">
                  {s!.paidAtBlock.toString()}
                </a>
              </Line>
              <Line label="Time">{paidAt}</Line>
              <Line label="Transaction" mono>
                {tx.isPending ? (
                  "Looking up…"
                ) : tx.data ? (
                  <a href={txUrl(tx.data.hash)} target="_blank" rel="noreferrer">
                    {tx.data.hash}
                  </a>
                ) : tx.isError ? (
                  "Couldn't fetch the log right now"
                ) : (
                  "Not found in that block"
                )}
              </Line>
            </>
          ) : null}

          {settleOnceAddress ? (
            <Line label="Contract" mono>
              <a href={addressUrl(settleOnceAddress)} target="_blank" rel="noreferrer">
                {settleOnceAddress}
              </a>
            </Line>
          ) : null}
        </dl>

        {paid ? (
          <div className={styles.stampRow}>
            <span className="stamp">
              PAID ONCE
              <small>BLOCK {s!.paidAtBlock.toString()}</small>
            </span>
          </div>
        ) : null}

        <p className={styles.fine}>
          Read live from the SettleOnce contract when this page loaded. This page stores nothing. A second payment for
          this payer and key is rejected by the contract.
        </p>
      </article>

      <p className={styles.back}>
        <Link href="/">Back to the desk</Link> or <Link href="/ledger">open the ledger</Link>.
      </p>
    </div>
  );
}

function Line({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </div>
  );
}

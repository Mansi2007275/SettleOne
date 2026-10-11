"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { chain, network } from "@/config/env";
import { useFeeEstimate } from "@/hooks/useFeeEstimate";
import type { PayOutcome, PayStep } from "@/hooks/usePayInvoice";
import { shortHex, txUrl } from "@/lib/explorer";
import { displayFeeUnits, shortfall } from "@/lib/funds";
import type { Invoice } from "@/lib/invoice";
import type { TicketStatus } from "@/lib/settlement";
import { formatUsdc } from "@/lib/usdc";
import { CopyButton } from "@/components/ui/CopyButton";
import styles from "./InvoiceTicket.module.css";

type Props = {
  invoice: Invoice;
  status: TicketStatus;
  payer: Address | undefined;
  /** USDC balance of the paying wallet, from useUsdcAccount. undefined while unknown. */
  balance: bigint | undefined;
  step: PayStep | null;
  outcome: PayOutcome | undefined;
  otherBusy: boolean;
  onPay: () => void;
  onRemove: () => void;
  onRetryRead: () => void;
  onSwitchNetwork: () => void;
  onDismiss: () => void;
};

const STEP_TEXT: Record<PayStep, string> = {
  checking: "Checking chain…",
  approving: "Approve in wallet…",
  paying: "Confirm in wallet…",
  confirming: "Settling on Arc…",
};

export function InvoiceTicket(props: Props) {
  const { invoice, status, payer, balance, step, outcome, otherBusy } = props;
  const amount = formatUsdc(invoice.amount);
  const fresh = usePunchMoment(status.kind === "paid");

  // Only a ticket that is about to be paid needs a fee or a balance check.
  const payable = status.kind === "ready" || status.kind === "approval";
  const feeUnits = useFeeEstimate(payer, invoice, payable);
  // The fee as it is shown, so "need" and "network fee" on screen actually add up.
  const feeShown = feeUnits === undefined ? undefined : displayFeeUnits(feeUnits);
  const missing = payable && balance !== undefined ? shortfall(balance, invoice.amount, feeUnits ?? 0n) : 0n;
  const short = missing > 0n;

  let chip: { tone: string; text: string };
  let action: React.ReactNode = null;

  if (step) {
    chip = { tone: "busy", text: STEP_TEXT[step] };
  } else {
    switch (status.kind) {
      case "connect":
        chip = { tone: "muted", text: "Connect wallet to check" };
        break;
      case "wrong-network":
        chip = { tone: "attention", text: "Wallet on another network" };
        action = (
          <button className="btn btn-small" onClick={props.onSwitchNetwork}>
            Switch to {chain.name}
          </button>
        );
        break;
      case "checking":
        chip = { tone: "muted", text: "Checking chain…" };
        break;
      case "unavailable":
        chip = { tone: "muted", text: "Status unavailable" };
        action = (
          <button className="btn btn-small" onClick={props.onRetryRead}>
            Check again
          </button>
        );
        break;
      case "paid": {
        chip = { tone: "paid", text: "Paid" };
        const path = payer ? receiptPath(payer, invoice) : null;
        action = path ? (
          <>
            <Link className="btn btn-small" href={path}>
              View receipt
            </Link>
            {/* Resolved on press: window.location doesn't exist when this is rendered on the server. */}
            <CopyButton label="Copy receipt link" value={() => `${window.location.origin}${path}`} />
          </>
        ) : null;
        break;
      }
      case "conflict":
        chip = { tone: "danger", text: "Conflict" };
        action = payer ? (
          <Link className="btn btn-small" href={`/receipt/${payer}/${invoice.key}`}>
            See what was paid
          </Link>
        ) : null;
        break;
      case "approval":
        // Allowance is short, so the pay flow batches approve + payOnce through Arc's
        // Multicall3From predeploy: one wallet signature. It falls back to two signatures if the
        // batch won't simulate, which is why the tag says what is expected, not what is promised.
        chip = { tone: "attention", text: "Needs approval" };
        action = (
          <>
            <button className="btn btn-signal btn-small" onClick={props.onPay} disabled={otherBusy || short}>
              Pay {amount} USDC
            </button>
            <span className={styles.oneSig}>
              1 signature
              <span className="visually-hidden">
                {" "}
                — the approval and the payment are sent as one batched transaction, so your wallet asks once.
              </span>
            </span>
          </>
        );
        break;
      case "ready":
        chip = { tone: "ready", text: "Ready" };
        action = (
          <button className="btn btn-signal btn-small" onClick={props.onPay} disabled={otherBusy || short}>
            Pay {amount} USDC
          </button>
        );
        break;
    }
  }

  const settled = status.kind === "paid" || status.kind === "conflict" ? status.settlement : null;

  return (
    <article
      className={styles.ticket}
      data-kind={status.kind}
      data-fresh={fresh ? "true" : undefined}
      aria-label={`${invoice.vendorRef} / ${invoice.invoiceRef}, ${amount} USDC, ${chip.text}`}
    >
      <div className={styles.body}>
        <p className={styles.refs}>
          <span>{invoice.vendorRef}</span>
          <span className={styles.slash}>/</span>
          <span>{invoice.invoiceRef}</span>
        </p>

        <p className={styles.amount}>
          <span className="mono">{amount}</span> <span className={styles.unit}>USDC</span>
        </p>

        <dl className={styles.details}>
          <div>
            <dt>To</dt>
            <dd className="mono">{invoice.recipient}</dd>
          </div>
          <div>
            <dt>Invoice key</dt>
            <dd className="mono" title={invoice.key}>
              {shortHex(invoice.key, 10, 8)}
            </dd>
          </div>
        </dl>

        {status.kind === "conflict" && settled ? (
          <p className={styles.alert}>
            This key was already paid {formatUsdc(settled.amount)} USDC to{" "}
            <span className="mono">{shortHex(settled.recipient)}</span>. The file now says something different. Fix
            the invoice; SettleOnce won&apos;t pay it twice.
          </p>
        ) : null}

        {status.kind === "unavailable" ? <p className={styles.alert}>Couldn&apos;t read the chain: {status.reason}</p> : null}

        {outcome ? (
          <div className={styles.outcome} data-kind={outcome.kind} role={outcome.kind === "error" ? "alert" : "status"}>
            {outcome.kind === "sent" ? (
              <p>
                {status.kind === "paid" ? "Settled in" : "Sent:"}{" "}
                <a href={txUrl(outcome.hash)} target="_blank" rel="noreferrer" className="mono">
                  {shortHex(outcome.hash, 8, 6)}
                </a>
              </p>
            ) : (
              <p>{outcome.message}</p>
            )}
            {outcome.kind !== "sent" ? (
              <button className="link-button" onClick={props.onDismiss}>
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={styles.footer}>
          <span className="chip" data-tone={chip.tone}>
            {chip.text}
          </span>
          <div className={styles.actions}>
            {action}
            {!step ? (
              <button className="link-button" onClick={props.onRemove} aria-label={`Remove ${invoice.invoiceRef} from desk`}>
                Remove
              </button>
            ) : null}
          </div>
        </div>

        {payable && !step ? (
          <div className={styles.money}>
            {feeShown !== undefined ? (
              <p className={styles.fee}>
                Network fee &asymp; <span className="mono">{formatUsdc(feeShown)}</span> USDC
              </p>
            ) : null}
            {short ? (
              <p className={styles.short} role="status">
                Need about <span className="mono">{formatUsdc(invoice.amount + (feeShown ?? 0n))}</span> USDC
                {feeShown !== undefined ? " (amount + network fee)" : ""}. You have{" "}
                <span className="mono">{formatUsdc(balance!)}</span>.
                {network !== "mainnet" ? (
                  <>
                    {" "}
                    <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                      Get test USDC
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {settled ? (
          <span className={`stamp ${styles.stamp}`} data-tone={status.kind === "conflict" ? "danger" : undefined}>
            {status.kind === "conflict" ? "CONFLICT" : "PAID ONCE"}
            <small>BLOCK {settled.paidAtBlock.toString()}</small>
          </span>
        ) : null}
      </div>

      <div className={styles.stub} aria-hidden="true">
        <span className={styles.punch} />
        {fresh ? <span className={styles.chad} /> : null}
        <span className={styles.stubLabel}>{settled ? "punched" : "punch on pay"}</span>
      </div>
    </article>
  );
}

/**
 * The public receipt page for this ticket, carrying the two references so the page can confirm
 * they really do derive the key it is showing.
 */
function receiptPath(payer: Address, invoice: Invoice): string {
  const v = encodeURIComponent(invoice.vendorRef);
  const i = encodeURIComponent(invoice.invoiceRef);
  return `/receipt/${payer}/${invoice.key}?v=${v}&i=${i}`;
}

/** True for a moment when this ticket turns paid while you watch. Already-paid tickets don't animate. */
function usePunchMoment(isPaid: boolean): boolean {
  const prev = useRef<boolean | null>(null);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (prev.current === false && isPaid) {
      setFresh(true);
      const t = setTimeout(() => setFresh(false), 1400);
      prev.current = isPaid;
      return () => clearTimeout(t);
    }
    prev.current = isPaid;
  }, [isPaid]);
  return fresh;
}

import Link from "next/link";
import { chain, settleOnceAddress } from "@/config/env";
import { GUARANTEE_LINE, GUARANTEES, LIMITS } from "@/lib/disclaimer";
import { addressUrl, shortHex } from "@/lib/explorer";
import styles from "./HowScreen.module.css";

/**
 * The long version of the six steps the desk shows as a stepper. Static: no wallet, no chain
 * reads, nothing stored. Someone sizing SettleOnce up should be able to read this page first.
 */
const STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Connect wallet",
    body: `Connect the wallet the money leaves from, on ${chain.name}. SettleOnce never takes custody and never asks for a seed phrase: it spends your USDC allowance, in your name, for the exact amount of one invoice. The same wallet is the one the contract files settlements under, so paying invoice INV-1042 from a second wallet is a separate record and a separate payment.`,
  },
  {
    title: "Add an invoice",
    body: "Three ways onto the desk: photograph a paper invoice and let the scanner read it in your tab, type it in by hand, or load the CSV file you keep. An invoice is four things — vendor reference, invoice number, recipient wallet and USDC amount. The first two become its permanent key; the last two are payment details you can still fix before paying.",
  },
  {
    title: "Save your invoice file",
    body: "Download the CSV. The desk in this browser is a convenience, not storage: clearing site data, a new laptop or a private window all lose it. The file is small, plain text and yours, and it is what you load back after anything goes wrong. Nothing about payment status is in it — that always comes from the chain.",
  },
  {
    title: "Pay once",
    body: "The desk reads the chain for the invoice key first, then pays. If your USDC allowance is short, the approval and the payment go out as one batched transaction, so your wallet asks for one signature. The contract records the settlement under (your wallet, invoice key) and moves the USDC in the same transaction. A second attempt at that key is rejected on chain.",
  },
  {
    title: "Recover after a crash",
    body: "This is the step the whole thing exists for. If the tab dies between the signature and the confirmation, you have no idea whether the money moved — so don't guess. Reopen the app, load your invoice file, and every row is checked against the contract: paid rows come back marked paid with their original transaction, the rest stay payable. There is nothing to reconcile by hand.",
  },
  {
    title: "See receipt and ledger",
    body: "Every paid invoice has a public receipt page read live from the contract, with a QR code of its own link and downloads as JSON or PDF for your records. The ledger lists every settlement this deployment has ever made, newest first, with a lookup form for one vendor reference and invoice number. No login, no wallet needed to read either.",
  },
];

export function HowScreen() {
  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <p className={styles.kicker}>How it works</p>
        <h1 className={styles.title}>Six steps, and the chain remembers all of them.</h1>
        <p className={styles.lede}>
          SettleOnce pays USDC invoices on {chain.name} straight from your wallet, and gives each invoice a permanent
          key so the contract can turn away a second payment for it. Here is the whole loop, including what happens
          when your app dies halfway through.
        </p>
      </header>

      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.punch} aria-hidden="true">
              {i + 1}
            </span>
            <div className={styles.stepBody}>
              <h2 className={styles.stepTitle}>
                <span className="visually-hidden">Step {i + 1}: </span>
                {step.title}
              </h2>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className={styles.panel} aria-labelledby="guarantees-title">
        <h2 id="guarantees-title">What SettleOnce guarantees</h2>
        <p className={styles.rule}>{GUARANTEE_LINE}</p>
        <ul className={styles.list}>
          {GUARANTEES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className={styles.note}>
          Enforced by{" "}
          {settleOnceAddress ? (
            <a className="mono" href={addressUrl(settleOnceAddress)} target="_blank" rel="noreferrer">
              {shortHex(settleOnceAddress)}
            </a>
          ) : (
            "the SettleOnce contract"
          )}{" "}
          on {chain.name}. No owner, no reset, no upgrade proxy.
        </p>
      </section>

      <section className={styles.panel} data-tone="limits" aria-labelledby="limits-title">
        <h2 id="limits-title">What it does not do</h2>
        <ul className={styles.list}>
          {LIMITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <p className={styles.cta}>
        <Link className="btn btn-signal" href="/">
          Start on the desk
        </Link>
      </p>
    </div>
  );
}

import { chain, settleOnceAddress } from "@/config/env";
import { addressUrl, shortHex } from "@/lib/explorer";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <h1 id="hero-title" className={styles.title}>
          Pay every invoice once. Even if the app dies halfway.
        </h1>
        <p className={styles.lede}>
          SettleOnce sends USDC on Arc straight from your wallet to the person you owe. Each invoice carries a
          permanent key, and the contract turns away a second payment for it. Lost the tab mid-payment? Load your
          invoice file again and the chain shows what already went out.
        </p>
      </div>

      <figure className={styles.rule} aria-label="The rule SettleOnce enforces">
        <div className={styles.ruleBody}>
          <p className={styles.ruleTitle}>The one rule</p>
          <p className={styles.ruleText}>One payer wallet + one invoice key = one payment, at most.</p>
          <figcaption className={styles.ruleCaption}>
            Enforced by{" "}
            {settleOnceAddress ? (
              <a href={addressUrl(settleOnceAddress)} target="_blank" rel="noreferrer" className="mono">
                {shortHex(settleOnceAddress)}
              </a>
            ) : (
              "the SettleOnce contract"
            )}{" "}
            on {chain.name}.
          </figcaption>
        </div>
        <div className={styles.ruleStub} aria-hidden="true">
          <span className={styles.ruleHole} />
        </div>
      </figure>
    </section>
  );
}

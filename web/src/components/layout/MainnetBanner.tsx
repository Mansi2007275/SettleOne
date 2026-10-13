import { network } from "@/config/env";
import styles from "./MainnetBanner.module.css";

/**
 * On Arc mainnet every payment moves real USDC, so the page says so and never stops saying so:
 * the banner sits inside the sticky header, above the navigation, and there is no way to dismiss
 * it. On testnet it does not render at all, so the testnet desk looks exactly as it did.
 */
export function MainnetBanner() {
  if (network !== "mainnet") return null;

  return (
    // The attribute is how the desk's scroll anchors know the sticky header is taller here.
    <div className={styles.banner} role="note" data-mainnet-banner="">
      <span className={styles.shell}>
        <span className={styles.mark} aria-hidden="true" />
        <strong>Arc mainnet</strong>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <span>real USDC</span>
      </span>
    </div>
  );
}

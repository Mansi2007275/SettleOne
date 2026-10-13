"use client";

import { chain } from "@/config/env";
import { useDemoTools } from "@/hooks/useDemoTools";
import { DEMO_AMOUNT } from "@/lib/demoInvoice";
import styles from "./DemoInvoiceButton.module.css";

/**
 * Fills the composer with a throwaway invoice that pays you 0.01 USDC, so the settle-once loop can
 * be tried without a counterparty. It only fills the form: adding, approving and paying stay manual.
 *
 * Hidden on mainnet, where a "demo" would move real money — unless the URL says `?demo=1`.
 */
export function DemoInvoiceButton({
  connected,
  onFill,
  align = "start",
}: {
  connected: boolean;
  onFill: () => void;
  align?: "start" | "center";
}) {
  const show = useDemoTools();
  if (!show) return null;

  return (
    <div className={styles.demo} data-align={align}>
      <button type="button" className="btn btn-small" onClick={onFill}>
        Try with a demo invoice
      </button>
      <p className={styles.hint}>
        Demo pays {DEMO_AMOUNT} USDC to your own wallet on {chain.name}.
        {connected ? null : " Connect a wallet to fill the recipient, or type one in."}
      </p>
    </div>
  );
}

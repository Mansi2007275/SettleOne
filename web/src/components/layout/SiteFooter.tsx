import { chain, settleOnceAddress } from "@/config/env";
import { addressUrl } from "@/lib/explorer";

export function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: "3px solid var(--rule)",
        background: "var(--page)",
        padding: "28px 0 40px",
        color: "var(--text-dim)",
        fontSize: "0.88rem",
      }}
    >
      <div className="shell" style={{ display: "grid", gap: 8 }}>
        <p style={{ maxWidth: "80ch" }}>
          SettleOnce guarantees at most one settlement per payer wallet and invoice key, through this contract on{" "}
          {chain.name}. It can&apos;t tell whether an invoice is legitimate, stop payments made outside it, or recover a
          payment sent to the wrong address.
        </p>
        <p>
          Contract{" "}
          {settleOnceAddress ? (
            <a className="mono" href={addressUrl(settleOnceAddress)} target="_blank" rel="noreferrer">
              {settleOnceAddress}
            </a>
          ) : (
            "not configured"
          )}
          . USDC <span className="mono">0x3600000000000000000000000000000000000000</span>.
        </p>
      </div>
    </footer>
  );
}

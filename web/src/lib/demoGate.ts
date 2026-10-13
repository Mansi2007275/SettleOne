import type { ArcNetwork } from "@/config/chains";

/**
 * Demo scaffolding on a real-money deployment.
 *
 * The demo invoice and the crash test exist to show the settle-once loop. On Arc mainnet both
 * would move or throw away real USDC, so they are not on the page at all. They can still be
 * reached deliberately — `?demo=1` — because the mainnet build is also what gets demonstrated.
 * On testnet they are always there, unchanged.
 */

export const DEMO_QUERY_KEY = "demo";

export function demoToolsVisible({ network, search }: { network: ArcNetwork; search: string }): boolean {
  if (network !== "mainnet") return true;
  try {
    return new URLSearchParams(search).get(DEMO_QUERY_KEY) === "1";
  } catch {
    return false;
  }
}

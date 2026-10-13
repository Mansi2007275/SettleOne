"use client";

import { useEffect, useState } from "react";
import { network } from "@/config/env";
import { demoToolsVisible } from "@/lib/demoGate";

/**
 * Whether the demo invoice and the crash test belong on this page.
 *
 * On testnet: always, exactly as before. On mainnet: only with `?demo=1` in the URL, so a
 * real-money deployment never offers a button that spends or throws away real USDC by accident —
 * but can still be demonstrated on purpose.
 *
 * The first render answers without the URL (false on mainnet), so the server HTML and the first
 * client render agree; the query string is read right after, in the browser.
 */
export function useDemoTools(): boolean {
  const [visible, setVisible] = useState(() => demoToolsVisible({ network, search: "" }));

  useEffect(() => {
    setVisible(demoToolsVisible({ network, search: window.location.search }));
  }, []);

  return visible;
}

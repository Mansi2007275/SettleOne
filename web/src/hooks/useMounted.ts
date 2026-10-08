"use client";

import { useEffect, useState } from "react";

/** True after the first client render. Wallet state only exists in the browser. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

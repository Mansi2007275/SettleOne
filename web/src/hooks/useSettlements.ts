"use client";

import { useMemo } from "react";
import type { Address, Hex } from "viem";
import { useReadContract } from "wagmi";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, settleOnceAddress } from "@/config/env";
import { explainError } from "@/lib/errors";
import type { Settlement } from "@/lib/settlement";

/**
 * Reads the on-chain settlement for every invoice key on the desk in one call.
 * This is the restore path: the desk can be rebuilt from a file, the status always comes from here.
 */
export function useSettlements(payer: Address | undefined, keys: Hex[]) {
  const enabled = !!payer && !!settleOnceAddress && keys.length > 0;

  const query = useReadContract({
    address: settleOnceAddress ?? undefined,
    abi: settleOnceAbi,
    functionName: "receiptsFor",
    args: payer ? [payer, keys] : undefined,
    chainId: chain.id,
    query: { enabled, refetchInterval: 15_000 },
  });

  const byKey = useMemo(() => {
    const map = new Map<Hex, Settlement>();
    if (!query.data) return map;
    // Guard against a response for an older key list while a refetch is in flight.
    if (query.data.length !== keys.length) return map;
    keys.forEach((key, i) => {
      const s = query.data[i];
      if (s) map.set(key, { recipient: s.recipient, paidAtBlock: s.paidAtBlock, amount: s.amount, paidAt: s.paidAt });
    });
    return map;
  }, [query.data, keys]);

  return {
    byKey,
    loading: enabled && query.isPending,
    error: query.isError ? explainError(query.error) : null,
    refetch: query.refetch,
  };
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, settleOnceAddress } from "@/config/env";

/**
 * Finds the transaction that settled (payer, key). The contract stores the block number, so this is a
 * single-block log query: no indexer, no database, no wide scan.
 */
export function useSettlementTx(payer: Address | undefined, key: Hex | undefined, paidAtBlock: bigint | undefined) {
  const client = usePublicClient({ chainId: chain.id });
  const enabled = !!client && !!settleOnceAddress && !!payer && !!key && !!paidAtBlock && paidAtBlock > 0n;

  return useQuery({
    queryKey: ["settlement-tx", chain.id, settleOnceAddress, payer, key, paidAtBlock?.toString()],
    enabled,
    staleTime: Infinity, // a settled transaction never changes
    queryFn: async () => {
      const logs = await client!.getContractEvents({
        address: settleOnceAddress!,
        abi: settleOnceAbi,
        eventName: "InvoicePaid",
        args: { payer: payer!, invoiceKey: key! },
        fromBlock: paidAtBlock!,
        toBlock: paidAtBlock!,
      });
      const log = logs[0];
      return log ? { hash: log.transactionHash as Hex, logIndex: log.logIndex } : null;
    },
  });
}

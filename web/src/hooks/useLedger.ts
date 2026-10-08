"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, settleOnceAddress, startBlock } from "@/config/env";
import { explainError } from "@/lib/errors";

export type LedgerEntry = {
  payer: Address;
  invoiceKey: Hex;
  recipient: Address;
  amount: bigint;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
};

const PAGE_SIZE = 25;
const MAX_CHUNKS_PER_PAGE = 40;
const START_CHUNK = 10_000n;
const MIN_CHUNK = 250n;

/**
 * Walks InvoicePaid logs backwards from the latest block. Public RPCs cap eth_getLogs ranges, so the
 * chunk size halves on failure and the scan resumes from where it stopped on "Load older".
 */
export function useLedger() {
  const client = usePublicClient({ chainId: chain.id });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<bigint | null>(null); // next block to scan downwards from
  const [latest, setLatest] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chunkRef = useRef(START_CHUNK);
  const started = useRef(false);

  const done = cursor !== null && cursor < startBlock;

  const scan = useCallback(
    async (fromTop?: bigint) => {
      if (!client || !settleOnceAddress) return;
      setLoading(true);
      setError(null);
      try {
        let to = fromTop ?? cursor ?? (await client.getBlockNumber());
        if (fromTop !== undefined || cursor === null) setLatest(to);
        const found: LedgerEntry[] = [];
        let chunks = 0;

        while (to >= startBlock && found.length < PAGE_SIZE && chunks < MAX_CHUNKS_PER_PAGE) {
          const span = chunkRef.current;
          const from = to - span + 1n > startBlock ? to - span + 1n : startBlock;
          try {
            const logs = await client.getContractEvents({
              address: settleOnceAddress,
              abi: settleOnceAbi,
              eventName: "InvoicePaid",
              fromBlock: from,
              toBlock: to,
            });
            for (const log of logs.reverse()) {
              const a = log.args;
              if (!a.payer || !a.invoiceKey || !a.recipient || a.amount === undefined) continue;
              found.push({
                payer: a.payer,
                invoiceKey: a.invoiceKey,
                recipient: a.recipient,
                amount: a.amount,
                blockNumber: log.blockNumber,
                txHash: log.transactionHash as Hex,
                logIndex: log.logIndex,
              });
            }
            to = from - 1n;
            chunks++;
          } catch (err) {
            if (chunkRef.current > MIN_CHUNK) {
              chunkRef.current = chunkRef.current / 2n;
              continue;
            }
            throw err;
          }
        }

        setEntries((prev) => (fromTop !== undefined ? found : [...prev, ...found]));
        setCursor(to);
      } catch (err) {
        setError(explainError(err));
      } finally {
        setLoading(false);
      }
    },
    [client, cursor],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const top = await client.getBlockNumber();
      await scan(top);
    } catch (err) {
      setError(explainError(err));
    }
  }, [client, scan]);

  useEffect(() => {
    if (started.current || !client || !settleOnceAddress) return;
    started.current = true;
    void scan();
  }, [client, scan]);

  return { entries, loading, error, done, latest, scannedDownTo: cursor, loadOlder: () => scan(), refresh };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { chain, USDC_ADDRESS } from "@/config/env";
import {
  blocksNeedingTimestamps,
  groupSuspectedDuplicates,
  nextChunk,
  rangeBlocks,
  scanFloor,
  summarizeDuplicates,
  windowSeconds,
  type DuplicateGroup,
  type DuplicateSummary,
  type RangeId,
  type RawTransfer,
  type TimedTransfer,
  type WindowId,
} from "@/lib/duplicateRadar";
import { explainError } from "@/lib/errors";

/** The ERC-20 event, named here rather than pulled out of the shared ABI by index. */
const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const MIN_CHUNK = 500n;
/** Block timestamps, read in small batches so one wallet can't fire hundreds of parallel calls. */
const TIMESTAMP_BATCH = 10;

export type ScanState = {
  running: boolean;
  /** Blocks looked at so far in this scan. */
  scannedBlocks: bigint;
  /** Blocks this scan intends to look at in total. */
  totalBlocks: bigint;
  transferCount: number;
  groups: DuplicateGroup[];
  summary: DuplicateSummary;
  error: string | null;
  /** True once a scan has finished or been stopped, so the empty state can be shown honestly. */
  finished: boolean;
  /** The block range actually covered, for the wording under the results. */
  range: { from: bigint; to: bigint } | null;
};

const IDLE: ScanState = {
  running: false,
  scannedBlocks: 0n,
  totalBlocks: 0n,
  transferCount: 0,
  groups: [],
  summary: { groupCount: 0, extraCount: 0, extraTotal: 0n, transferCount: 0 },
  error: null,
  finished: false,
  range: null,
};

/**
 * Reads the USDC `Transfer` logs a wallet *sent* (the `from` topic is indexed, so the RPC does the
 * filtering) and hands them to the pure grouping in lib/duplicateRadar.
 *
 * Deliberately careful about the chain:
 *   - `eth_getLogs` is walked backwards in chunks, halving the chunk when an RPC refuses the range.
 *   - Only the blocks that could possibly form a pair get a timestamp read, and every timestamp is
 *     cached for the lifetime of the page, so changing the window costs nothing.
 *   - Stop is honoured between chunks, and whatever was found so far stays on screen.
 */
export function useDuplicateScan() {
  const client = usePublicClient({ chainId: chain.id });
  const [state, setState] = useState<ScanState>(IDLE);
  const stopped = useRef(false);
  const running = useRef(false);
  const timestamps = useRef(new Map<string, bigint>());
  const transfers = useRef<RawTransfer[]>([]);
  const windowRef = useRef<WindowId>("24h");

  useEffect(() => () => void (stopped.current = true), []);

  const stop = useCallback(() => {
    stopped.current = true;
  }, []);

  /** Re-group what has already been scanned. Used while scanning and when the window changes. */
  const regroup = useCallback((window: WindowId, patch: Partial<ScanState> = {}) => {
    const timed: TimedTransfer[] = [];
    for (const transfer of transfers.current) {
      const timestamp = timestamps.current.get(transfer.blockNumber.toString());
      if (timestamp !== undefined) timed.push({ ...transfer, timestamp });
    }
    const groups = groupSuspectedDuplicates(timed, windowSeconds(window));
    setState((s) => ({
      ...s,
      ...patch,
      groups,
      transferCount: transfers.current.length,
      summary: summarizeDuplicates(groups, transfers.current.length),
    }));
  }, []);

  const setWindow = useCallback(
    (window: WindowId) => {
      windowRef.current = window;
      // Timestamps are already cached, so a different window is pure recomputation.
      if (transfers.current.length > 0) regroup(window);
    },
    [regroup],
  );

  const scan = useCallback(
    async ({ address, window, range }: { address: Address; window: WindowId; range: RangeId }) => {
      if (!client || running.current) return;
      running.current = true;
      stopped.current = false;
      windowRef.current = window;
      transfers.current = [];

      try {
        const latest = await client.getBlockNumber();
        const blocks = rangeBlocks(range);
        const floor = scanFloor(latest, blocks);
        const totalBlocks = latest - floor + 1n;

        setState({ ...IDLE, running: true, totalBlocks, range: { from: floor, to: latest } });

        let cursor = latest;
        let chunk = 10_000n;

        while (!stopped.current) {
          const next = nextChunk({ cursor, floor, chunk });
          if (!next) break;
          try {
            const logs = await client.getLogs({
              address: USDC_ADDRESS,
              event: TRANSFER_EVENT,
              args: { from: address },
              fromBlock: next.fromBlock,
              toBlock: next.toBlock,
            });
            for (const log of logs) {
              const { to, value } = log.args;
              if (!to || value === undefined) continue;
              transfers.current.push({
                to,
                value,
                blockNumber: log.blockNumber,
                txHash: log.transactionHash,
                logIndex: log.logIndex,
              });
            }
            cursor = next.fromBlock - 1n;
            setState((s) => ({
              ...s,
              scannedBlocks: latest - cursor,
              transferCount: transfers.current.length,
            }));
          } catch (err) {
            // A refused range is the usual reason; halve the chunk and try the same blocks again.
            if (chunk > MIN_CHUNK) {
              chunk = chunk / 2n;
              continue;
            }
            throw err;
          }
        }

        await fillTimestamps();
        regroup(windowRef.current, { running: false, finished: true });
      } catch (err) {
        setState((s) => ({ ...s, running: false, finished: true, error: explainError(err) }));
      } finally {
        running.current = false;
      }

      /** Timestamps for the blocks that could form a pair, in small batches, cached. */
      async function fillTimestamps() {
        if (!client) return;
        const wanted = blocksNeedingTimestamps(transfers.current).filter(
          (block) => !timestamps.current.has(block.toString()),
        );
        for (let i = 0; i < wanted.length && !stopped.current; i += TIMESTAMP_BATCH) {
          const batch = wanted.slice(i, i + TIMESTAMP_BATCH);
          const blocks = await Promise.all(
            batch.map((blockNumber) => client.getBlock({ blockNumber, includeTransactions: false })),
          );
          blocks.forEach((block, j) => timestamps.current.set(batch[j]!.toString(), block.timestamp));
        }
      }
    },
    [client, regroup],
  );

  const reset = useCallback(() => {
    stopped.current = true;
    transfers.current = [];
    setState(IDLE);
  }, []);

  return { ...state, scan, stop, reset, setWindow, ready: !!client };
}

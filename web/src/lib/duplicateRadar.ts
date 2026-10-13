import type { Address, Hex } from "viem";

/**
 * Duplicate radar: find USDC payments that look like the same bill paid twice.
 *
 * It works on plain ERC-20 `Transfer` logs, so it sees *every* payment a wallet made — including
 * the ones that never went through SettleOnce. A pair is suspicious when the same recipient got
 * the same amount twice inside a short window. That is a heuristic, not a verdict: a weekly
 * retainer or two identical invoices from one vendor look exactly the same from outside, which is
 * why everything here is called "suspected" and nothing is ever marked as fraud.
 *
 * All of it is pure. Amounts stay bigint (6-decimal base units), timestamps stay bigint seconds,
 * and nothing is read from the chain, the clock or the browser in this file.
 */

export type RawTransfer = {
  to: Address;
  /** USDC base units, 6 decimals. */
  value: bigint;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
};

export type TimedTransfer = RawTransfer & {
  /** Block timestamp, unix seconds. */
  timestamp: bigint;
};

export type DuplicateGroup = {
  /** `to:value`, the pair that makes these transfers look like one bill. */
  id: string;
  recipient: Address;
  value: bigint;
  transfers: TimedTransfer[];
  /** Payments beyond the first one in this group: what a duplicate guard would have stopped. */
  extraCount: number;
  extraTotal: bigint;
  firstTimestamp: bigint;
  lastTimestamp: bigint;
};

export type DuplicateSummary = {
  groupCount: number;
  /** Suspected duplicate payments: every transfer in a group except its first. */
  extraCount: number;
  extraTotal: bigint;
  /** Transfers looked at, after the chain scan. */
  transferCount: number;
};

export const WINDOW_OPTIONS = [
  { id: "1h", label: "1 hour", seconds: 3_600n },
  { id: "24h", label: "24 hours", seconds: 86_400n },
  { id: "7d", label: "7 days", seconds: 604_800n },
] as const;

export type WindowId = (typeof WINDOW_OPTIONS)[number]["id"];

export const DEFAULT_WINDOW: WindowId = "24h";

export function windowSeconds(id: WindowId): bigint {
  return WINDOW_OPTIONS.find((w) => w.id === id)?.seconds ?? 86_400n;
}

/** Same recipient, same amount. Addresses are compared case-insensitively. */
export function transferKey(transfer: Pick<RawTransfer, "to" | "value">): string {
  return `${transfer.to.toLowerCase()}:${transfer.value.toString()}`;
}

/**
 * The blocks whose timestamps are actually needed.
 *
 * A transfer can only be part of a suspected duplicate if some *other* transfer shares its
 * recipient and amount, so only those blocks need a timestamp read. On a busy wallet this is the
 * difference between a handful of block reads and hundreds.
 */
export function blocksNeedingTimestamps(transfers: readonly RawTransfer[]): bigint[] {
  const counts = new Map<string, number>();
  for (const transfer of transfers) {
    const key = transferKey(transfer);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const blocks = new Set<string>();
  for (const transfer of transfers) {
    if ((counts.get(transferKey(transfer)) ?? 0) > 1) blocks.add(transfer.blockNumber.toString());
  }
  return [...blocks].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Group the transfers that look like one bill paid more than once.
 *
 * Within one (recipient, amount) pair the transfers are sorted oldest first and cut into clusters:
 * a cluster holds everything within `window` seconds **of its own first transfer**, so a cluster
 * can never stretch beyond the window the reader chose. A payment exactly `window` seconds later
 * is still inside it. Clusters of one are not duplicates and are dropped.
 *
 * Groups come back newest first, so the most recent suspicion is the one on screen.
 */
export function groupSuspectedDuplicates(
  transfers: readonly TimedTransfer[],
  window: bigint,
): DuplicateGroup[] {
  const byKey = new Map<string, TimedTransfer[]>();
  for (const transfer of transfers) {
    const key = transferKey(transfer);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(transfer);
    else byKey.set(key, [transfer]);
  }

  const groups: DuplicateGroup[] = [];

  for (const [key, bucket] of byKey) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort(compareTransfers);

    let cluster: TimedTransfer[] = [];
    const flush = () => {
      if (cluster.length > 1) groups.push(toGroup(key, cluster));
      cluster = [];
    };

    for (const transfer of sorted) {
      const start = cluster[0];
      if (!start || transfer.timestamp - start.timestamp <= window) cluster.push(transfer);
      else {
        flush();
        cluster.push(transfer);
      }
    }
    flush();
  }

  return groups.sort((a, b) => {
    if (a.lastTimestamp !== b.lastTimestamp) return a.lastTimestamp > b.lastTimestamp ? -1 : 1;
    return b.extraTotal > a.extraTotal ? 1 : b.extraTotal < a.extraTotal ? -1 : 0;
  });
}

/** Oldest first, with the block and log index breaking ties inside one timestamp. */
function compareTransfers(a: TimedTransfer, b: TimedTransfer): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}

function toGroup(id: string, cluster: TimedTransfer[]): DuplicateGroup {
  const first = cluster[0]!;
  const last = cluster[cluster.length - 1]!;
  // The first payment is the one that was presumably owed; the rest are the suspected duplicates.
  const extraTotal = cluster.slice(1).reduce((total, t) => total + t.value, 0n);
  return {
    id,
    recipient: first.to,
    value: first.value,
    transfers: cluster,
    extraCount: cluster.length - 1,
    extraTotal,
    firstTimestamp: first.timestamp,
    lastTimestamp: last.timestamp,
  };
}

export function summarizeDuplicates(groups: readonly DuplicateGroup[], transferCount = 0): DuplicateSummary {
  let extraCount = 0;
  let extraTotal = 0n;
  for (const group of groups) {
    extraCount += group.extraCount;
    extraTotal += group.extraTotal;
  }
  return { groupCount: groups.length, extraCount, extraTotal, transferCount };
}

/* ------------------------------------------------------------------ the scan range */

/** One getLogs call at a time; public RPCs cap the range, so the scan walks backwards in chunks. */
export const CHUNK_BLOCKS = 10_000n;

export const RANGE_OPTIONS = [
  { id: "20k", label: "20,000 blocks", blocks: 20_000n },
  { id: "100k", label: "100,000 blocks", blocks: 100_000n },
  { id: "500k", label: "500,000 blocks", blocks: 500_000n },
] as const;

export type RangeId = (typeof RANGE_OPTIONS)[number]["id"];

export const DEFAULT_RANGE: RangeId = "100k";

export function rangeBlocks(id: RangeId): bigint {
  return RANGE_OPTIONS.find((r) => r.id === id)?.blocks ?? 100_000n;
}

/**
 * The next chunk to read, walking down from `latest`. Returns null once the floor is reached.
 * `floor` is whichever is higher: the start of the chosen range, or block 0.
 */
export function nextChunk({
  cursor,
  floor,
  chunk = CHUNK_BLOCKS,
}: {
  cursor: bigint;
  floor: bigint;
  chunk?: bigint;
}): { fromBlock: bigint; toBlock: bigint } | null {
  if (cursor < floor) return null;
  const fromBlock = cursor - chunk + 1n > floor ? cursor - chunk + 1n : floor;
  return { fromBlock, toBlock: cursor };
}

/** Where the scan should stop, given the latest block and how far back the reader asked to look. */
export function scanFloor(latest: bigint, blocks: bigint): bigint {
  return latest + 1n > blocks ? latest - blocks + 1n : 0n;
}

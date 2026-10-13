import { getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  blocksNeedingTimestamps,
  groupSuspectedDuplicates,
  nextChunk,
  rangeBlocks,
  scanFloor,
  summarizeDuplicates,
  transferKey,
  windowSeconds,
  type TimedTransfer,
} from "./duplicateRadar";

const ACME = getAddress("0x391c7b24264c2ff12306BBaa4e9285fcF34bE5eF");
const NORTH = getAddress("0x5B38Da6a701c568545dCfcB03FcB875f56beddC4");
const DAY = 86_400n;
const T0 = 1_760_000_000n;

let nonce = 0;
function transfer(over: Partial<TimedTransfer> & { timestamp: bigint }): TimedTransfer {
  nonce += 1;
  return {
    to: ACME,
    value: 20_000n,
    blockNumber: 4_000n + BigInt(nonce),
    txHash: `0x${nonce.toString(16).padStart(64, "0")}` as Hex,
    logIndex: 0,
    ...over,
  };
}

describe("transferKey", () => {
  it("is the recipient and the amount, case-insensitively", () => {
    const lower = ACME.toLowerCase() as Address;
    expect(transferKey({ to: lower, value: 1n })).toBe(transferKey({ to: ACME, value: 1n }));
  });

  it("keeps different amounts and different recipients apart", () => {
    expect(transferKey({ to: ACME, value: 1n })).not.toBe(transferKey({ to: ACME, value: 2n }));
    expect(transferKey({ to: ACME, value: 1n })).not.toBe(transferKey({ to: NORTH, value: 1n }));
  });

  it("does not confuse amounts that share digits", () => {
    // String concatenation without a separator would make these collide.
    expect(transferKey({ to: ACME, value: 11n })).not.toBe(transferKey({ to: ACME, value: 1n }));
  });
});

describe("groupSuspectedDuplicates", () => {
  it("finds nothing in an empty scan", () => {
    expect(groupSuspectedDuplicates([], DAY)).toEqual([]);
  });

  it("does not flag a single payment", () => {
    expect(groupSuspectedDuplicates([transfer({ timestamp: T0 })], DAY)).toEqual([]);
  });

  it("groups the same amount to the same recipient inside the window", () => {
    const groups = groupSuspectedDuplicates(
      [transfer({ timestamp: T0 }), transfer({ timestamp: T0 + 600n })],
      DAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      recipient: ACME,
      value: 20_000n,
      extraCount: 1,
      extraTotal: 20_000n,
      firstTimestamp: T0,
      lastTimestamp: T0 + 600n,
    });
    expect(groups[0]!.transfers).toHaveLength(2);
  });

  it("reports the extra payments, not the first one", () => {
    const groups = groupSuspectedDuplicates(
      [transfer({ timestamp: T0 }), transfer({ timestamp: T0 + 60n }), transfer({ timestamp: T0 + 120n })],
      DAY,
    );
    expect(groups[0]).toMatchObject({ extraCount: 2, extraTotal: 40_000n });
    expect(groups[0]!.transfers).toHaveLength(3);
  });

  it("does not flag the same amount to a different recipient", () => {
    expect(
      groupSuspectedDuplicates([transfer({ timestamp: T0 }), transfer({ timestamp: T0 + 60n, to: NORTH })], DAY),
    ).toEqual([]);
  });

  it("does not flag a different amount to the same recipient", () => {
    expect(
      groupSuspectedDuplicates([transfer({ timestamp: T0 }), transfer({ timestamp: T0 + 60n, value: 20_001n })], DAY),
    ).toEqual([]);
  });

  it("compares amounts as bigint, beyond what a float could hold", () => {
    const huge = 10n ** 24n;
    const groups = groupSuspectedDuplicates(
      [transfer({ timestamp: T0, value: huge }), transfer({ timestamp: T0 + 1n, value: huge })],
      DAY,
    );
    expect(groups[0]).toMatchObject({ value: huge, extraTotal: huge });
    // One base unit apart is a different amount, however large the numbers are.
    expect(
      groupSuspectedDuplicates(
        [transfer({ timestamp: T0, value: huge }), transfer({ timestamp: T0 + 1n, value: huge + 1n })],
        DAY,
      ),
    ).toEqual([]);
  });

  it("includes a payment exactly on the window edge", () => {
    const groups = groupSuspectedDuplicates([transfer({ timestamp: T0 }), transfer({ timestamp: T0 + DAY })], DAY);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.extraCount).toBe(1);
  });

  it("leaves a payment one second past the window alone", () => {
    expect(groupSuspectedDuplicates([transfer({ timestamp: T0 }), transfer({ timestamp: T0 + DAY + 1n })], DAY)).toEqual(
      [],
    );
  });

  it("measures the window from the first payment in the cluster, not the previous one", () => {
    // Three payments 20 hours apart: 1 and 2 are within a day, 3 is nearly two days after 1.
    const groups = groupSuspectedDuplicates(
      [
        transfer({ timestamp: T0 }),
        transfer({ timestamp: T0 + 72_000n }),
        transfer({ timestamp: T0 + 144_000n }),
      ],
      DAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.extraCount).toBe(1);
    expect(groups[0]!.transfers.map((t) => t.timestamp)).toEqual([T0, T0 + 72_000n]);
  });

  it("splits one recipient and amount into separate groups months apart", () => {
    const groups = groupSuspectedDuplicates(
      [
        transfer({ timestamp: T0 }),
        transfer({ timestamp: T0 + 300n }),
        transfer({ timestamp: T0 + 90n * DAY }),
        transfer({ timestamp: T0 + 90n * DAY + 300n }),
      ],
      DAY,
    );
    expect(groups).toHaveLength(2);
    // Newest group first.
    expect(groups[0]!.firstTimestamp).toBe(T0 + 90n * DAY);
    expect(groups[1]!.firstTimestamp).toBe(T0);
  });

  it("sorts each group oldest first, whatever order the logs arrived in", () => {
    const groups = groupSuspectedDuplicates(
      [transfer({ timestamp: T0 + 600n }), transfer({ timestamp: T0 }), transfer({ timestamp: T0 + 300n })],
      DAY,
    );
    expect(groups[0]!.transfers.map((t) => t.timestamp)).toEqual([T0, T0 + 300n, T0 + 600n]);
  });

  it("keeps two transfers in one block apart, in log order", () => {
    const groups = groupSuspectedDuplicates(
      [
        transfer({ timestamp: T0, blockNumber: 10n, logIndex: 7 }),
        transfer({ timestamp: T0, blockNumber: 10n, logIndex: 2 }),
      ],
      DAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.transfers.map((t) => t.logIndex)).toEqual([2, 7]);
  });

  it("widens and narrows with the window", () => {
    const pair = [transfer({ timestamp: T0 }), transfer({ timestamp: T0 + 7_200n })];
    expect(groupSuspectedDuplicates(pair, windowSeconds("1h"))).toEqual([]);
    expect(groupSuspectedDuplicates(pair, windowSeconds("24h"))).toHaveLength(1);
    expect(groupSuspectedDuplicates(pair, windowSeconds("7d"))).toHaveLength(1);
  });

  it("does not mutate the transfers it was given", () => {
    const input = [transfer({ timestamp: T0 + 600n }), transfer({ timestamp: T0 })];
    const order = input.map((t) => t.timestamp);
    groupSuspectedDuplicates(input, DAY);
    expect(input.map((t) => t.timestamp)).toEqual(order);
  });
});

describe("blocksNeedingTimestamps", () => {
  it("is empty when nothing could possibly pair up", () => {
    const transfers = [
      { to: ACME, value: 1n, blockNumber: 10n, txHash: "0x1" as Hex, logIndex: 0 },
      { to: NORTH, value: 2n, blockNumber: 11n, txHash: "0x2" as Hex, logIndex: 0 },
    ];
    expect(blocksNeedingTimestamps(transfers)).toEqual([]);
  });

  it("asks only for the blocks of transfers that share a recipient and amount", () => {
    const transfers = [
      { to: ACME, value: 1n, blockNumber: 30n, txHash: "0x1" as Hex, logIndex: 0 },
      { to: ACME, value: 1n, blockNumber: 10n, txHash: "0x2" as Hex, logIndex: 0 },
      { to: NORTH, value: 9n, blockNumber: 20n, txHash: "0x3" as Hex, logIndex: 0 },
    ];
    expect(blocksNeedingTimestamps(transfers)).toEqual([10n, 30n]);
  });

  it("asks for each block once, even with several matching transfers in it", () => {
    const transfers = [
      { to: ACME, value: 1n, blockNumber: 10n, txHash: "0x1" as Hex, logIndex: 0 },
      { to: ACME, value: 1n, blockNumber: 10n, txHash: "0x2" as Hex, logIndex: 1 },
    ];
    expect(blocksNeedingTimestamps(transfers)).toEqual([10n]);
  });
});

describe("summarizeDuplicates", () => {
  it("is all zeros with nothing found", () => {
    expect(summarizeDuplicates([], 12)).toEqual({
      groupCount: 0,
      extraCount: 0,
      extraTotal: 0n,
      transferCount: 12,
    });
  });

  it("adds up the suspected duplicates across groups", () => {
    const groups = groupSuspectedDuplicates(
      [
        transfer({ timestamp: T0 }),
        transfer({ timestamp: T0 + 60n }),
        transfer({ timestamp: T0 + 120n }),
        transfer({ timestamp: T0, to: NORTH, value: 500_000n }),
        transfer({ timestamp: T0 + 60n, to: NORTH, value: 500_000n }),
      ],
      DAY,
    );
    expect(summarizeDuplicates(groups, 5)).toEqual({
      groupCount: 2,
      extraCount: 3,
      extraTotal: 40_000n + 500_000n,
      transferCount: 5,
    });
  });
});

describe("the scan walk", () => {
  it("stops the range at the chosen number of blocks", () => {
    expect(scanFloor(1_000_000n, rangeBlocks("100k"))).toBe(900_001n);
    expect(scanFloor(1_000_000n, rangeBlocks("20k"))).toBe(980_001n);
  });

  it("never asks for a block before genesis", () => {
    expect(scanFloor(50n, 100_000n)).toBe(0n);
  });

  it("walks backwards in chunks and reports its last chunk", () => {
    const floor = scanFloor(100_000n, 25_000n);
    const first = nextChunk({ cursor: 100_000n, floor })!;
    expect(first).toEqual({ fromBlock: 90_001n, toBlock: 100_000n });
    const second = nextChunk({ cursor: first.fromBlock - 1n, floor })!;
    expect(second).toEqual({ fromBlock: 80_001n, toBlock: 90_000n });
    const third = nextChunk({ cursor: second.fromBlock - 1n, floor })!;
    // Clipped to the floor rather than overshooting it.
    expect(third).toEqual({ fromBlock: 75_001n, toBlock: 80_000n });
    expect(nextChunk({ cursor: third.fromBlock - 1n, floor })).toBeNull();
  });

  it("asks for a single block when that is all that is left", () => {
    expect(nextChunk({ cursor: 10n, floor: 10n })).toEqual({ fromBlock: 10n, toBlock: 10n });
  });
});

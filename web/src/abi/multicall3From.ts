/**
 * Arc's `Multicall3From` predeploy: one transaction, several calls, one wallet signature.
 *
 * Interface as documented at https://docs.arc.io/arc/concepts/batched-transactions
 *
 * The part that matters here: unlike an ordinary batching contract, each sub-call is routed through
 * Arc's `CallFrom` precompile, so every target sees **the original EOA as `msg.sender`**, not the
 * multicall contract. That is what lets SettleOnce record the settlement under the payer's own
 * wallet and lets USDC spend the payer's own allowance. The docs state it plainly:
 *
 *   "Unlike a common batching contract, it preserves the original externally owned account (EOA)
 *    wallet as `msg.sender` for each target call."
 *
 * Two constraints the docs are explicit about:
 *   - the batch must be submitted **from an EOA**; a call relayed through another contract (so with
 *     a different `msg.sender`) is rejected.
 *   - there is **no value forwarding** on Arc: `aggregate3Value` is not supported, which is why only
 *     `aggregate3` is declared below and it is declared non-payable.
 *
 * With `allowFailure: false` on a call, one failed sub-call reverts the whole batch — all or nothing.
 */

import type { Address } from "viem";

/** Same address on Arc Testnet and Arc mainnet. */
export const MULTICALL3_FROM_ADDRESS: Address = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";

export const multicall3FromAbi = [
  {
    type: "function",
    name: "aggregate3",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        internalType: "struct Multicall3From.Call3[]",
        components: [
          { name: "target", type: "address", internalType: "address" },
          { name: "allowFailure", type: "bool", internalType: "bool" },
          { name: "callData", type: "bytes", internalType: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct Multicall3From.Result[]",
        components: [
          { name: "success", type: "bool", internalType: "bool" },
          { name: "returnData", type: "bytes", internalType: "bytes" },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
] as const;

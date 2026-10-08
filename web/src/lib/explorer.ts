import type { Address, Hex } from "viem";
import { explorerUrl } from "@/config/env";

export const txUrl = (hash: Hex) => `${explorerUrl}/tx/${hash}`;
export const addressUrl = (address: Address) => `${explorerUrl}/address/${address}`;
export const blockUrl = (block: bigint | number) => `${explorerUrl}/block/${block.toString()}`;

export function shortHex(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

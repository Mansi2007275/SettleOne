"use client";

import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { erc20Abi } from "@/abi/erc20";
import { chain, settleOnceAddress, USDC_ADDRESS } from "@/config/env";

/** USDC balance (ERC-20 view, 6 decimals) and the allowance granted to SettleOnce. */
export function useUsdcAccount(owner: Address | undefined) {
  const enabled = !!owner && !!settleOnceAddress;

  const query = useReadContracts({
    allowFailure: false,
    contracts:
      owner && settleOnceAddress
        ? [
            { address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner], chainId: chain.id },
            {
              address: USDC_ADDRESS,
              abi: erc20Abi,
              functionName: "allowance",
              args: [owner, settleOnceAddress],
              chainId: chain.id,
            },
          ]
        : [],
    query: { enabled, refetchInterval: 15_000 },
  });

  const [balance, allowance] = (query.data ?? []) as [bigint | undefined, bigint | undefined];

  return {
    balance,
    allowance,
    loading: enabled && query.isPending,
    error: query.isError,
    refetch: query.refetch,
  };
}

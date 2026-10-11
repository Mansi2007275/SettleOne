"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, settleOnceAddress } from "@/config/env";
import { nativeFeeToUsdcUnits } from "@/lib/funds";
import type { Invoice } from "@/lib/invoice";

/**
 * Gas this payment is assumed to need when the node won't estimate it. `payOnce` is one storage
 * write plus one `transferFrom`, so this is a deliberately generous ceiling rather than a guess at
 * the real number.
 */
const FALLBACK_GAS = 150_000n;

const REFRESH_MS = 30_000;

/**
 * What `payOnce` will cost in gas for one invoice, expressed in 6-decimal USDC units.
 *
 * Arc charges gas against native USDC (18 decimals) out of the same balance the invoice is paid
 * from (the ERC-20 interface, 6 decimals), so the fee can be added straight to an invoice amount
 * once it is scaled down. One balance, never shown as two.
 *
 * Estimation reverts before the payer has approved the amount, which is exactly the case the Pay
 * button is for, so a failed estimate falls back to `FALLBACK_GAS` instead of showing nothing.
 * Only a missing gas price leaves the fee unknown, and then this returns `undefined` so the UI can
 * stay silent rather than print a number it does not have.
 */
export function useFeeEstimate(
  payer: Address | undefined,
  invoice: Invoice | undefined,
  enabled = true,
): bigint | undefined {
  const client = usePublicClient({ chainId: chain.id });
  const active = enabled && !!client && !!settleOnceAddress && !!payer && !!invoice;

  const query = useQuery({
    queryKey: [
      "fee-estimate",
      chain.id,
      settleOnceAddress,
      payer,
      invoice?.key,
      invoice?.recipient,
      invoice?.amount.toString(),
    ],
    enabled: active,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<bigint | null> => {
      const [gas, gasPrice] = await Promise.allSettled([
        client!.estimateContractGas({
          address: settleOnceAddress!,
          abi: settleOnceAbi,
          functionName: "payOnce",
          args: [invoice!.key, invoice!.recipient, invoice!.amount],
          account: payer!,
        }),
        client!.getGasPrice(),
      ]);

      if (gasPrice.status !== "fulfilled") return null;
      return nativeFeeToUsdcUnits(gas.status === "fulfilled" ? gas.value : FALLBACK_GAS, gasPrice.value);
    },
  });

  return query.data ?? undefined;
}

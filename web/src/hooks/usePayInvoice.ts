"use client";

import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { readContract, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { erc20Abi } from "@/abi/erc20";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, settleOnceAddress, USDC_ADDRESS } from "@/config/env";
import { explainError } from "@/lib/errors";
import type { Invoice } from "@/lib/invoice";

export type PayStep = "checking" | "approving" | "paying" | "confirming";

export type PayOutcome =
  | { kind: "error"; message: string }
  | { kind: "note"; message: string }
  | { kind: "sent"; hash: Hex };

const RECEIPT_TIMEOUT_MS = 90_000;

/**
 * One invoice, one careful path:
 *   1. Re-read the settlement from the chain (never trust what the screen showed a minute ago).
 *   2. Approve exactly the invoice amount if the allowance is short.
 *   3. Simulate payOnce, so a duplicate or conflict is caught before the wallet even opens.
 *   4. Send, then wait for the receipt. If the wait times out, re-read the chain instead of guessing.
 *
 * `onSent` runs as soon as the wallet hands back a hash. The desk's crash test uses it to wipe local
 * state and reload before any success message is shown.
 */
export function usePayInvoice({
  onDone,
  onSent,
}: {
  onDone: () => Promise<unknown> | void;
  onSent?: (invoice: Invoice, hash: Hex) => boolean | void;
}) {
  const config = useConfig();
  const { address } = useAccount();
  const [active, setActive] = useState<{ key: Hex; step: PayStep } | null>(null);
  const [outcomes, setOutcomes] = useState<Record<Hex, PayOutcome | undefined>>({});
  const busy = useRef(false);

  const pay = useCallback(
    async (invoice: Invoice) => {
      if (busy.current || !address || !settleOnceAddress) return;
      busy.current = true;
      const contract = settleOnceAddress;
      const step = (s: PayStep) => setActive({ key: invoice.key, step: s });
      setOutcomes((o) => ({ ...o, [invoice.key]: undefined }));

      try {
        step("checking");
        const existing = await readContract(config, {
          address: contract,
          abi: settleOnceAbi,
          functionName: "receiptFor",
          args: [address, invoice.key],
          chainId: chain.id,
        });
        if (existing.paidAtBlock !== 0n) {
          // Already settled. The refreshed status shows "Paid" or "Conflict"; nothing is sent.
          setOutcomes((o) => ({
            ...o,
            [invoice.key]: {
              kind: "note",
              message: `The chain already has this invoice as paid (block ${existing.paidAtBlock}). Nothing was sent.`,
            },
          }));
          return;
        }

        const allowance = await readContract(config, {
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, contract],
          chainId: chain.id,
        });

        if (allowance < invoice.amount) {
          step("approving");
          const approveHash = await writeContract(config, {
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [contract, invoice.amount],
            chainId: chain.id,
          });
          const approval = await waitForTransactionReceipt(config, {
            hash: approveHash,
            chainId: chain.id,
            timeout: RECEIPT_TIMEOUT_MS,
          });
          if (approval.status !== "success") {
            throw new Error("The approval was reverted on chain. Nothing was paid.");
          }
        }

        step("paying");
        const { request } = await simulateContract(config, {
          address: contract,
          abi: settleOnceAbi,
          functionName: "payOnce",
          args: [invoice.key, invoice.recipient, invoice.amount],
          account: address,
          chainId: chain.id,
        });
        const hash = await writeContract(config, request);

        if (onSent?.(invoice, hash) === true) return; // crash test took over

        setOutcomes((o) => ({ ...o, [invoice.key]: { kind: "sent", hash } }));
        step("confirming");
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: chain.id, timeout: RECEIPT_TIMEOUT_MS });
        if (receipt.status !== "success") {
          throw new Error("The payment transaction was reverted on chain. The invoice is still unpaid.");
        }
      } catch (err) {
        setOutcomes((o) => ({ ...o, [invoice.key]: { kind: "error", message: explainError(err) } }));
      } finally {
        busy.current = false;
        setActive(null);
        await onDone();
      }
    },
    [address, config, onDone, onSent],
  );

  const dismiss = useCallback((key: Hex) => setOutcomes((o) => ({ ...o, [key]: undefined })), []);

  return { pay, active, outcomes, dismiss, busy: active !== null };
}

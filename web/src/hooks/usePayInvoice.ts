"use client";

import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { readContract, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { erc20Abi } from "@/abi/erc20";
import { MULTICALL3_FROM_ADDRESS, multicall3FromAbi } from "@/abi/multicall3From";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, settleOnceAddress, USDC_ADDRESS } from "@/config/env";
import { buildApproveAndPayCalls } from "@/lib/batchPay";
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
 *   2. If the allowance is short, try approve + payOnce as **one** batch through Arc's
 *      `Multicall3From` predeploy, so the payer signs once. The batch is simulated from the payer
 *      account first; if the simulation fails for any reason the flow falls back to the two-step
 *      approve-then-pay path below, which is unchanged.
 *   3. Simulate payOnce, so a duplicate or conflict is caught before the wallet even opens.
 *   4. Send, then wait for the receipt. If the wait times out, re-read the chain instead of guessing.
 *
 * `Multicall3From` keeps the payer's EOA as `msg.sender` for both sub-calls, so USDC spends the
 * payer's own allowance and SettleOnce records the settlement under the payer's own wallet — the
 * `InvoicePaid` event names the payer, not the multicall contract. With `allowFailure: false` on
 * both calls the batch is all-or-nothing: a duplicate still reverts, and the approval reverts with
 * it, so a blocked payment leaves no allowance lying around.
 *
 * `onSent` runs as soon as the wallet hands back a hash, on either path. The desk's crash test uses
 * it to wipe local state and reload before any success message is shown.
 *
 * `pay` sends without asking anything. On Arc mainnet the confirmation the user has to read lives
 * in front of it — `requestPay` in DeskScreen, which is the desk's only entry into this hook and
 * covers both paths above. A new caller has to go through there, or add the same gate itself.
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

      /**
       * Everything after the wallet signs, shared by the batch and the two-step path.
       * Returns true when the crash test took the session over and nothing more should run.
       */
      const settle = async (hash: Hex): Promise<boolean> => {
        if (onSent?.(invoice, hash) === true) return true; // crash test took over

        setOutcomes((o) => ({ ...o, [invoice.key]: { kind: "sent", hash } }));
        step("confirming");
        const receipt = await waitForTransactionReceipt(config, {
          hash,
          chainId: chain.id,
          timeout: RECEIPT_TIMEOUT_MS,
        });
        if (receipt.status !== "success") {
          throw new Error("The payment transaction was reverted on chain. The invoice is still unpaid.");
        }
        return false;
      };

      /**
       * Simulate approve + payOnce as one batch from the payer account. Returns the write request
       * when Arc accepts it, or `undefined` for *any* failure, which is the signal to fall back to
       * the two-step flow. A real problem with the payment itself (already paid, conflict, no
       * funds) will surface again from the two-step path with its own, better error message.
       */
      const simulateBatch = async () => {
        try {
          const calls = buildApproveAndPayCalls({ invoice, settleOnce: contract });
          const { request } = await simulateContract(config, {
            address: MULTICALL3_FROM_ADDRESS,
            abi: multicall3FromAbi,
            functionName: "aggregate3",
            args: [calls],
            account: address,
            chainId: chain.id,
          });
          return request;
        } catch {
          return undefined;
        }
      };

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
          // One signature if Arc will take it. The simulation is the only thing that decides:
          // it covers a missing predeploy, a chain that doesn't route CallFrom, a duplicate, a
          // conflict, a short balance — any of those and we quietly take the two-step path.
          step("paying");
          const batch = await simulateBatch();
          if (batch) {
            const hash = await writeContract(config, batch);
            await settle(hash);
            return;
          }

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
        if (await settle(hash)) return;
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

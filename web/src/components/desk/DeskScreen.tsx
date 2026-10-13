"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { chain, configProblems } from "@/config/env";
import { useMounted } from "@/hooks/useMounted";
import { usePayInvoice } from "@/hooks/usePayInvoice";
import { useSettlements } from "@/hooks/useSettlements";
import { useUsdcAccount } from "@/hooks/useUsdcAccount";
import { demoInvoice, type DemoFill } from "@/lib/demoInvoice";
import { flowProgress, pickLatestPaidKey } from "@/lib/flowProgress";
import { MAX_INVOICES, invoicesToCsv, type Invoice } from "@/lib/invoice";
import type { ScanPrefill } from "@/lib/invoiceScan";
import { ticketStatus } from "@/lib/settlement";
import { hasSummary, summarizeDesk } from "@/lib/summary";
import {
  loadCrashSwitch,
  loadDesk,
  loadFlowCollapsed,
  loadSavedCsv,
  saveCrashSwitch,
  saveDesk,
  saveFlowCollapsed,
  saveSavedCsv,
  wipeDesk,
} from "@/lib/storage";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { CrashTest } from "./CrashTest";
import { DemoInvoiceButton } from "./DemoInvoiceButton";
import { DeskSummaryStrip } from "./DeskSummary";
import { FlowStepper } from "./FlowStepper";
import { Hero } from "./Hero";
import { InvoiceComposer } from "./InvoiceComposer";
import { InvoiceFileBench } from "./InvoiceFileBench";
import { InvoiceScanner } from "./InvoiceScanner";
import { InvoiceTicket } from "./InvoiceTicket";
import { WalletPanel } from "./WalletPanel";
import styles from "./DeskScreen.module.css";

export function DeskScreen() {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [desk, setDesk] = useState<Invoice[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [crashArmed, setCrashArmed] = useState(false);
  const [savedCsv, setSavedCsv] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<ScanPrefill | null>(null);
  const [demoFill, setDemoFill] = useState<DemoFill | null>(null);
  const [stepsCollapsed, setStepsCollapsed] = useState(false);

  useEffect(() => {
    setDesk(loadDesk());
    setCrashArmed(loadCrashSwitch());
    setSavedCsv(loadSavedCsv());
    setStepsCollapsed(loadFlowCollapsed());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveDesk(desk);
  }, [desk, hydrated]);

  const onRightNetwork = chainId === chain.id;
  const keys = useMemo(() => desk.map((i) => i.key), [desk]);
  const settlements = useSettlements(onRightNetwork ? address : undefined, keys);
  const usdc = useUsdcAccount(onRightNetwork ? address : undefined);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([settlements.refetch(), usdc.refetch()]);
  }, [settlements, usdc]);

  const onSent = useCallback(
    (_invoice: Invoice, _hash: Hex) => {
      if (!crashArmed) return false;
      // Simulated crash: the payment is already broadcast. Throw away everything local and reload.
      wipeDesk();
      saveCrashSwitch(false);
      window.location.reload();
      return true;
    },
    [crashArmed],
  );

  const payment = usePayInvoice({ onDone: refreshAll, onSent });

  // Fills the composer only: the invoice is added, approved and paid by hand like any other.
  // With no wallet connected the recipient is left empty, and the composer focuses it.
  const fillDemoInvoice = useCallback(() => {
    setDemoFill({ input: demoInvoice(address), at: Date.now() });
  }, [address]);

  const collapseSteps = useCallback((collapsed: boolean) => {
    setStepsCollapsed(collapsed);
    saveFlowCollapsed(collapsed);
  }, []);

  const statuses = useMemo(
    () =>
      desk.map((invoice) =>
        ticketStatus({
          invoice,
          connected: mounted && isConnected,
          onRightNetwork,
          settlement: settlements.byKey.get(invoice.key),
          settlementsLoading: settlements.loading,
          settlementsError: settlements.error,
          allowance: usdc.allowance,
        }),
      ),
    [desk, mounted, isConnected, onRightNetwork, settlements.byKey, settlements.loading, settlements.error, usdc.allowance],
  );

  // Rolled up from the same chain-derived statuses the tickets show, never from local memory.
  const summary = useMemo(
    () => summarizeDesk(desk.map((invoice, i) => ({ invoice, status: statuses[i]! }))),
    [desk, statuses],
  );

  // Only with a wallet on the right network has the contract actually been asked.
  const walletReady = mounted && isConnected && onRightNetwork;
  const showSummary = walletReady && hasSummary(summary);

  const savedMatches = desk.length > 0 && savedCsv === invoicesToCsv(desk);

  // The newest paid invoice, from the settlements the contract returned — never from local memory.
  const latestPaidKey = useMemo(
    () =>
      pickLatestPaidKey(
        desk.flatMap((invoice, i) => {
          const status = statuses[i]!;
          return status.kind === "paid" ? [{ key: invoice.key, paidAtBlock: status.settlement.paidAtBlock }] : [];
        }),
      ),
    [desk, statuses],
  );

  // What the reader still has to do. Paid count and receipt come from the chain-derived statuses.
  const progress = useMemo(
    () =>
      flowProgress({
        walletReady,
        invoiceCount: desk.length,
        unsaved: desk.length > 0 && !savedMatches,
        paidCount: summary.paidCount,
        latestPaidKey,
      }),
    [walletReady, desk.length, savedMatches, summary.paidCount, latestPaidKey],
  );

  return (
    <div className="shell">
      <Hero />
      {hydrated ? (
        <FlowStepper
          progress={progress}
          collapsed={stepsCollapsed}
          onCollapsedChange={collapseSteps}
          receiptHref={address && latestPaidKey ? `/receipt/${address}/${latestPaidKey}` : null}
        />
      ) : null}
      <SetupNotice problems={configProblems} />

      <div className={styles.desk}>
        <aside className={styles.bench} aria-label="Workbench">
          {/* ids are the targets the progress steps scroll to */}
          <div id="desk-add" className={styles.anchor}>
            <InvoiceScanner onScanned={(result) => setPrefill({ result, at: Date.now() })} />
          </div>
          <InvoiceComposer
            desk={desk}
            full={desk.length >= MAX_INVOICES}
            prefill={prefill}
            demoFill={demoFill}
            connected={mounted && isConnected}
            onAdd={(inv) => setDesk((d) => [...d, inv])}
            onDemoFill={fillDemoInvoice}
          />
          <div id="desk-file" className={styles.anchor}>
            <InvoiceFileBench
              desk={desk}
              savedCsv={savedCsv}
              onLoad={(loaded) => setDesk(loaded)}
              onSaved={(csv) => {
                saveSavedCsv(csv);
                setSavedCsv(csv);
              }}
              onClear={() => setDesk([])}
            />
          </div>
          <div id="desk-wallet" className={styles.anchor}>
            <WalletPanel balance={usdc.balance} loading={usdc.loading} error={usdc.error} />
          </div>
          <CrashTest
            on={crashArmed}
            canArm={savedMatches}
            onChange={(on) => {
              setCrashArmed(on);
              saveCrashSwitch(on);
            }}
          />
        </aside>

        <section id="desk-tickets" className={`${styles.rail} ${styles.anchor}`} aria-labelledby="rail-title">
          <header className={styles.railHead}>
            <h2 id="rail-title">On the desk</h2>
            {desk.length > 0 ? (
              <p className={styles.tally}>
                {desk.length} invoice{desk.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </header>

          {showSummary ? <DeskSummaryStrip summary={summary} /> : null}

          {crashArmed ? (
            <p className={styles.armed} role="status">
              Crash test armed. The next payment you send will wipe this desk and reload the page.
            </p>
          ) : null}

          {!hydrated ? null : desk.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>The desk is empty.</p>
              <p>
                Write an invoice in the workbench, or load the invoice file you saved earlier. Paid invoices come back
                marked as paid.
              </p>
              <DemoInvoiceButton connected={mounted && isConnected} onFill={fillDemoInvoice} align="center" />
            </div>
          ) : (
            <ol className={styles.tickets}>
              {desk.map((invoice, i) => (
                <li key={invoice.key}>
                  <InvoiceTicket
                    invoice={invoice}
                    status={statuses[i]!}
                    payer={address}
                    balance={usdc.balance}
                    step={payment.active?.key === invoice.key ? payment.active.step : null}
                    outcome={payment.outcomes[invoice.key]}
                    otherBusy={payment.busy}
                    onPay={() => payment.pay(invoice)}
                    onRemove={() => setDesk((d) => d.filter((x) => x.key !== invoice.key))}
                    onRetryRead={() => void refreshAll()}
                    onSwitchNetwork={() => switchChain({ chainId: chain.id })}
                    onDismiss={() => payment.dismiss(invoice.key)}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

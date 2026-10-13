"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { chain, configProblems, network } from "@/config/env";
import { useDemoTools } from "@/hooks/useDemoTools";
import { useMounted } from "@/hooks/useMounted";
import { usePayInvoice } from "@/hooks/usePayInvoice";
import { useSettlements } from "@/hooks/useSettlements";
import { useUsdcAccount } from "@/hooks/useUsdcAccount";
import { demoInvoice, type DemoFill } from "@/lib/demoInvoice";
import { flowProgress, pickLatestPaidKey } from "@/lib/flowProgress";
import { MAX_INVOICES, invoicesToCsv, type Invoice } from "@/lib/invoice";
import type { ScanPrefill } from "@/lib/invoiceScan";
import { payConfirmRequired } from "@/lib/payConfirm";
import { ticketStatus } from "@/lib/settlement";
import { hasSummary, summarizeDesk } from "@/lib/summary";
import {
  rememberConfirmation,
  rememberPaidVendors,
  walletWarnings,
  type VendorBook,
} from "@/lib/walletGuard";
import {
  loadConfirmedWallets,
  loadCrashSwitch,
  loadDesk,
  loadFlowCollapsed,
  loadSavedCsv,
  loadVendorBook,
  saveConfirmedWallets,
  saveCrashSwitch,
  saveDesk,
  saveFlowCollapsed,
  saveSavedCsv,
  saveVendorBook,
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
import { InvoiceScanner, type ScanHandoff } from "./InvoiceScanner";
import { InvoiceTicket } from "./InvoiceTicket";
import { PayConfirmDialog } from "./PayConfirmDialog";
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
  const [vendorBook, setVendorBook] = useState<VendorBook>({});
  const [confirmedWallets, setConfirmedWallets] = useState<Hex[]>([]);
  const [scanHandoff, setScanHandoff] = useState<ScanHandoff | null>(null);
  /** The invoice waiting on the mainnet confirmation. Nothing is sent while this is set. */
  const [pendingPay, setPendingPay] = useState<Invoice | null>(null);
  const demoTools = useDemoTools();

  useEffect(() => {
    setDesk(loadDesk());
    setCrashArmed(loadCrashSwitch());
    setSavedCsv(loadSavedCsv());
    setStepsCollapsed(loadFlowCollapsed());
    setVendorBook(loadVendorBook());
    setConfirmedWallets(loadConfirmedWallets());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveDesk(desk);
  }, [desk, hydrated]);

  // A crash test that is not on the page must not stay armed from an earlier session.
  useEffect(() => {
    if (!demoTools && crashArmed) {
      setCrashArmed(false);
      saveCrashSwitch(false);
    }
  }, [demoTools, crashArmed]);

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

  /**
   * The desk's one way to start a payment, so the mainnet confirmation covers both paths: the
   * single `payOnce` and the one-signature approve-and-pay batch. On testnet it pays straight
   * away, exactly as before.
   */
  const requestPay = useCallback(
    (invoice: Invoice) => {
      if (payConfirmRequired(network)) setPendingPay(invoice);
      else void payment.pay(invoice);
    },
    [payment.pay], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const confirmPay = useCallback(() => {
    const invoice = pendingPay;
    setPendingPay(null);
    if (invoice) void payment.pay(invoice);
  }, [pendingPay, payment.pay]); // eslint-disable-line react-hooks/exhaustive-deps

  /** An invoice image dropped on the CSV bench: send it up to the scanner and show it working. */
  const scanInstead = useCallback((file: File) => {
    setScanHandoff({ file, at: Date.now() });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById("desk-add")
      ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

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

  /**
   * The vendor-wallet memory, written only from settlements the contract confirmed. It is what
   * makes a silently changed recipient visible: the key ignores the recipient on purpose, so the
   * contract can't catch this one and the desk has to.
   */
  useEffect(() => {
    if (!hydrated) return;
    const paid = desk.flatMap((invoice, i) => {
      const status = statuses[i]!;
      return status.kind === "paid"
        ? [{ vendorRef: invoice.vendorRef, recipient: status.settlement.recipient, paidAtBlock: status.settlement.paidAtBlock }]
        : [];
    });
    if (paid.length === 0) return;
    setVendorBook((book) => {
      const next = rememberPaidVendors(book, paid);
      // rememberPaidVendors returns the same object when nothing changed, so this writes once.
      if (next !== book) saveVendorBook(next);
      return next;
    });
  }, [desk, statuses, hydrated]);

  const confirmWallet = useCallback((key: Hex) => {
    setConfirmedWallets((keys) => {
      const next = rememberConfirmation(keys, key);
      saveConfirmedWallets(next);
      return next;
    });
  }, []);

  /** Tickets whose vendor is known at a different wallet, or that clash with another row here. */
  const warnings = useMemo(
    () =>
      walletWarnings({
        rows: desk.map((invoice, i) => ({
          key: invoice.key,
          vendorRef: invoice.vendorRef,
          recipient: invoice.recipient,
          paid: statuses[i]!.kind === "paid",
        })),
        book: vendorBook,
        confirmedKeys: confirmedWallets,
      }),
    [desk, statuses, vendorBook, confirmedWallets],
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
            <InvoiceScanner
              onScanned={(result) => setPrefill({ result, at: Date.now() })}
              handoff={scanHandoff}
            />
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
              onScanInstead={scanInstead}
            />
          </div>
          <div id="desk-wallet" className={styles.anchor}>
            <WalletPanel balance={usdc.balance} loading={usdc.loading} error={usdc.error} />
          </div>
          {/* Fault injection. Off the page on mainnet, where wiping a desk throws away real work. */}
          {demoTools ? (
            <CrashTest
              on={crashArmed}
              canArm={savedMatches}
              onChange={(on) => {
                setCrashArmed(on);
                saveCrashSwitch(on);
              }}
            />
          ) : null}
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
                    warning={warnings.get(invoice.key) ?? null}
                    onConfirmWallet={() => confirmWallet(invoice.key)}
                    onPay={() => requestPay(invoice)}
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

      {/* Mainnet only: the last look before real USDC moves. */}
      {pendingPay ? (
        <PayConfirmDialog
          key={pendingPay.key}
          invoice={pendingPay}
          onConfirm={confirmPay}
          onCancel={() => setPendingPay(null)}
        />
      ) : null}
    </div>
  );
}

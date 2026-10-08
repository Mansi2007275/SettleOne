import type { Metadata } from "next";
import { LedgerScreen } from "@/components/ledger/LedgerScreen";

export const metadata: Metadata = {
  title: "Ledger",
  description: "Every InvoicePaid event from the SettleOnce contract, read straight from Arc.",
};

export default function LedgerPage() {
  return <LedgerScreen />;
}

import { getAddress, type Hex } from "viem";
import type { Invoice } from "./invoice";

/**
 * The desk (the list of invoices you loaded) is kept in this browser for convenience only.
 * Nothing about payment status is stored here: paid / unpaid always comes from the contract.
 * Wiping this is exactly the "app lost its state" scenario SettleOnce is built to survive.
 */
const DESK_KEY = "settleonce.desk.v1";
const CRASH_KEY = "settleonce.crash-after-send.v1";

type StoredInvoice = { key: Hex; vendorRef: string; invoiceRef: string; recipient: string; amount: string };

export function loadDesk(): Invoice[] {
  try {
    const raw = window.localStorage.getItem(DESK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredInvoice[];
    return parsed.map((i) => ({ ...i, recipient: getAddress(i.recipient), amount: BigInt(i.amount) }));
  } catch {
    return [];
  }
}

export function saveDesk(invoices: Invoice[]): void {
  try {
    const data: StoredInvoice[] = invoices.map((i) => ({ ...i, amount: i.amount.toString() }));
    window.localStorage.setItem(DESK_KEY, JSON.stringify(data));
  } catch {
    /* storage can be unavailable (private mode); the desk still works in memory */
  }
}

export function wipeDesk(): void {
  try {
    window.localStorage.removeItem(DESK_KEY);
  } catch {
    /* ignore */
  }
}

const SAVED_KEY = "settleonce.last-saved-file.v1";

/** The CSV text of the last file you downloaded, so the app can tell you if the desk has unsaved changes. */
export function loadSavedCsv(): string | null {
  try {
    return window.localStorage.getItem(SAVED_KEY);
  } catch {
    return null;
  }
}

export function saveSavedCsv(csv: string): void {
  try {
    window.localStorage.setItem(SAVED_KEY, csv);
  } catch {
    /* ignore */
  }
}

export function loadCrashSwitch(): boolean {
  try {
    return window.localStorage.getItem(CRASH_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCrashSwitch(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(CRASH_KEY, "1");
    else window.localStorage.removeItem(CRASH_KEY);
  } catch {
    /* ignore */
  }
}

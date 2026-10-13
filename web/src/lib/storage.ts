import { getAddress, isAddress, type Hex } from "viem";
import type { Invoice } from "./invoice";
import { MAX_VENDORS, type VendorBook } from "./walletGuard";

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

const FLOW_COLLAPSED_KEY = "settleonce.flow-steps-collapsed.v1";

/**
 * Whether the six-step strip is collapsed to its one-line bar in this browser.
 * The steps are never hidden for good: collapsed still shows which step you are on.
 */
export function loadFlowCollapsed(): boolean {
  try {
    return window.localStorage.getItem(FLOW_COLLAPSED_KEY) === "1";
  } catch {
    /* storage can be unavailable (private mode); the steps just open again next time */
    return false;
  }
}

export function saveFlowCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(FLOW_COLLAPSED_KEY, "1");
    else window.localStorage.removeItem(FLOW_COLLAPSED_KEY);
  } catch {
    /* the strip still collapses for this page view, it just will not be remembered */
  }
}

const VENDOR_BOOK_KEY = "settleonce.vendor-wallets.v1";
const WALLET_CONFIRMED_KEY = "settleonce.wallet-confirmed.v1";

type StoredVendor = { recipient: string; lastPaidBlock: string };

/**
 * The wallet each vendor was last paid at, so a silently changed recipient can be spotted.
 * Only ever written from a settlement the contract confirmed; paid status still comes from chain.
 */
export function loadVendorBook(): VendorBook {
  try {
    const raw = window.localStorage.getItem(VENDOR_BOOK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredVendor>;
    const book: VendorBook = {};
    for (const [vendorRef, value] of Object.entries(parsed).slice(0, MAX_VENDORS)) {
      if (!value || !isAddress(value.recipient, { strict: false })) continue;
      book[vendorRef] = { recipient: getAddress(value.recipient), lastPaidBlock: BigInt(value.lastPaidBlock) };
    }
    return book;
  } catch {
    /* unreadable or unavailable storage just means no vendor history to compare against */
    return {};
  }
}

export function saveVendorBook(book: VendorBook): void {
  try {
    const data: Record<string, StoredVendor> = {};
    for (const [vendorRef, value] of Object.entries(book)) {
      data[vendorRef] = { recipient: value.recipient, lastPaidBlock: value.lastPaidBlock.toString() };
    }
    window.localStorage.setItem(VENDOR_BOOK_KEY, JSON.stringify(data));
  } catch {
    /* the guard still works for this page view, it just won't be remembered */
  }
}

/** Invoice keys whose new wallet the reader has confirmed with the vendor. */
export function loadConfirmedWallets(): Hex[] {
  try {
    const raw = window.localStorage.getItem(WALLET_CONFIRMED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is Hex => typeof key === "string" && /^0x[0-9a-fA-F]{64}$/.test(key));
  } catch {
    return [];
  }
}

export function saveConfirmedWallets(keys: readonly Hex[]): void {
  try {
    window.localStorage.setItem(WALLET_CONFIRMED_KEY, JSON.stringify(keys));
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

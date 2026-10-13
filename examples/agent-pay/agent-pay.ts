/**
 * agent-pay — an AI agent paying a list of bills, exactly once each.
 *
 *   npx tsx examples/agent-pay/agent-pay.ts examples/agent-pay/bills.json
 *
 * The point of this example is the rerun. Kill it mid-payment (`--crash-after=1`) and run it
 * again: the agent keeps no state of its own, asks the chain about every bill before it signs
 * anything, and the SettleOnce contract refuses a second settlement for an invoice key it has
 * already recorded. Nothing is ever paid twice, and nothing has to be reconciled by hand.
 *
 * Secrets: PRIVATE_KEY is read from examples/agent-pay/.env and handed straight to viem. It is
 * never printed, never put in an error message and never written to a file.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SettleOnceError,
  blockUrl,
  createArcClients,
  deriveInvoiceKey,
  explainError,
  parseUsdcAmount,
  payOnce,
  requireAddress,
  txUrl,
  type ArcNetwork,
  type PayOnceResult,
} from "../../sdk/src/index.ts";

type Bill = { vendorRef: string; invoiceRef: string; recipient: string; amountUsdc: string | number };

type Row = {
  vendor: string;
  invoice: string;
  status: "PAID NOW" | "ALREADY PAID" | "CONFLICT" | "FAILED";
  link: string;
  note: string;
};

const HERE = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const { billsPath, crashAfter } = readArgs(process.argv.slice(2));

  // .env sits next to this script, so the agent can be run from anywhere in the repo.
  loadEnvFile(resolve(HERE, ".env"));

  const network = readNetwork(process.env.NETWORK);
  const privateKey = process.env.PRIVATE_KEY ?? "";
  if (!privateKey) {
    fail("PRIVATE_KEY is not set. Copy examples/agent-pay/.env.example to .env and fill it in.");
  }
  const contract = requireAddress(process.env.SETTLEONCE_ADDRESS ?? "", "SETTLEONCE_ADDRESS");

  const bills = readBills(billsPath);
  const { chain, account, publicClient, walletClient } = createArcClients({ network, privateKey });

  console.log(`agent-pay · ${chain.name} · ${bills.length} bill${bills.length === 1 ? "" : "s"}`);
  console.log(`payer    ${account.address}`);
  console.log(`contract ${contract}`);
  if (crashAfter !== null) console.log(`crash    armed: exits right after payment ${crashAfter} is sent`);
  console.log("");

  await run({ bills, contract, crashAfter, chain, publicClient, walletClient });
}

async function run({
  bills,
  contract,
  crashAfter,
  chain,
  publicClient,
  walletClient,
}: {
  bills: Bill[];
  contract: `0x${string}`;
  crashAfter: number | null;
  chain: ReturnType<typeof createArcClients>["chain"];
  publicClient: ReturnType<typeof createArcClients>["publicClient"];
  walletClient: ReturnType<typeof createArcClients>["walletClient"];
}): Promise<void> {
  const rows: Row[] = [];
  let sent = 0;
  let trouble = false;

  // One at a time: the nonces are sequential, and a crash should leave one half-finished payment
  // at most — which is exactly the situation SettleOnce is built to recover from.
  for (const [i, bill] of bills.entries()) {
    const label = `${bill.vendorRef} / ${bill.invoiceRef}`;
    console.log(`[${i + 1}/${bills.length}] ${label} — ${bill.amountUsdc} USDC to ${bill.recipient}`);

    try {
      const result = await payOnce(walletClient, publicClient, {
        contract,
        vendorRef: bill.vendorRef,
        invoiceRef: bill.invoiceRef,
        recipient: bill.recipient,
        amountUsdc: bill.amountUsdc,
        onSent: ({ txHash }) => {
          sent += 1;
          console.log(`          sent ${txHash}`);
          if (crashAfter !== null && sent >= crashAfter) {
            // The money may well be on its way. The agent dies without ever learning the outcome.
            console.log("💥 Agent crashed");
            process.exit(1);
          }
        },
      });
      rows.push(describe(result, bill, chain));
      console.log(`          ${rows[rows.length - 1]!.status}`);
      if (result.status === "conflict") trouble = true;
    } catch (err) {
      trouble = true;
      const message = err instanceof SettleOnceError ? err.message : explainError(err);
      console.log(`          FAILED — ${message}`);
      rows.push({ vendor: bill.vendorRef, invoice: bill.invoiceRef, status: "FAILED", link: "", note: message });
    }
  }

  console.log("");
  printTable(rows);

  const paid = rows.filter((r) => r.status === "PAID NOW").length;
  const already = rows.filter((r) => r.status === "ALREADY PAID").length;
  console.log("");
  console.log(`${paid} paid now · ${already} already paid · ${rows.length} bill${rows.length === 1 ? "" : "s"} total`);
  if (already > 0) console.log("Rerun safe: the contract turned away every payment it had already recorded.");
  if (trouble) process.exitCode = 1;
}

function describe(result: PayOnceResult, bill: Bill, chain: ReturnType<typeof createArcClients>["chain"]): Row {
  const base = { vendor: bill.vendorRef, invoice: bill.invoiceRef };
  switch (result.status) {
    case "paid":
      return { ...base, status: "PAID NOW", link: txUrl(chain, result.txHash), note: "" };
    case "already-paid":
      return {
        ...base,
        status: "ALREADY PAID",
        link: blockUrl(chain, result.receipt.paidAtBlock),
        note: `settled in block ${result.receipt.paidAtBlock}`,
      };
    case "conflict":
      return {
        ...base,
        status: "CONFLICT",
        link: blockUrl(chain, result.receipt.paidAtBlock),
        note: `chain holds ${result.receipt.amountUsdc} USDC to ${result.receipt.recipient}`,
      };
  }
}

/* ------------------------------------------------------------------ input */

function readArgs(argv: string[]): { billsPath: string; crashAfter: number | null } {
  let billsPath: string | null = null;
  let crashAfter: number | null = null;

  for (const arg of argv) {
    const crash = /^--crash-after=(\d+)$/.exec(arg);
    if (crash) {
      crashAfter = Number(crash[1]);
      if (crashAfter < 1) fail("--crash-after=N needs N of 1 or more.");
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("usage: npx tsx examples/agent-pay/agent-pay.ts [bills.json] [--crash-after=N]");
      process.exit(0);
    }
    if (arg.startsWith("--")) fail(`Unknown flag ${arg}.`);
    if (billsPath) fail("Pass one bills file.");
    billsPath = arg;
  }

  return { billsPath: resolve(billsPath ?? resolve(HERE, "bills.json")), crashAfter };
}

function readNetwork(value: string | undefined): ArcNetwork {
  if (value === "testnet" || value === "mainnet") return value;
  if (!value) fail('NETWORK is not set. Use NETWORK=testnet or NETWORK=mainnet in examples/agent-pay/.env.');
  return fail(`NETWORK must be "testnet" or "mainnet" (got "${value}").`);
}

/** Node reads the file itself; a missing .env is fine when the variables are already exported. */
function loadEnvFile(path: string): void {
  try {
    process.loadEnvFile(path);
  } catch {
    /* no .env here: fall back to whatever is already in the environment */
  }
}

/**
 * The bills file, checked completely before a single payment goes out. A bad row anywhere stops
 * the run: an agent should not pay half a file and leave you guessing which half.
 */
function readBills(path: string): Bill[] {
  let parsed: unknown;
  try {
    // Windows editors like to save JSON with a byte-order mark; JSON.parse chokes on it.
    parsed = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    return fail(`Couldn't read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(parsed)) fail(`${path} must hold a JSON array of bills.`);
  if (parsed.length === 0) fail(`${path} has no bills in it.`);

  const problems: string[] = [];
  const bills: Bill[] = [];
  const seen = new Map<string, number>();

  parsed.forEach((row: unknown, i: number) => {
    const at = `bill ${i + 1}`;
    if (typeof row !== "object" || row === null) {
      problems.push(`${at}: not an object.`);
      return;
    }
    const { vendorRef, invoiceRef, recipient, amountUsdc } = row as Record<string, unknown>;
    if (typeof vendorRef !== "string" || vendorRef.trim() === "") problems.push(`${at}: vendorRef is missing.`);
    if (typeof invoiceRef !== "string" || invoiceRef.trim() === "") problems.push(`${at}: invoiceRef is missing.`);
    if (typeof recipient !== "string") problems.push(`${at}: recipient is missing.`);
    if (typeof amountUsdc !== "string" && typeof amountUsdc !== "number") {
      problems.push(`${at}: amountUsdc is missing.`);
    }
    if (typeof vendorRef !== "string" || typeof invoiceRef !== "string" || typeof recipient !== "string") return;
    if (typeof amountUsdc !== "string" && typeof amountUsdc !== "number") return;

    try {
      requireAddress(recipient, "recipient");
      parseUsdcAmount(amountUsdc);
    } catch (err) {
      problems.push(`${at}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Two rows with the same references are one invoice; the second would just be refused on chain.
    const key = deriveInvoiceKey(vendorRef, invoiceRef);
    const first = seen.get(key);
    if (first !== undefined) {
      problems.push(`${at}: same invoice key as bill ${first} (${vendorRef} / ${invoiceRef}).`);
      return;
    }
    seen.set(key, i + 1);
    bills.push({ vendorRef, invoiceRef, recipient, amountUsdc });
  });

  if (problems.length > 0) {
    console.error(`${path} has problems, so nothing was paid:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  return bills;
}

/* ------------------------------------------------------------------ output */

function printTable(rows: Row[]): void {
  const header: Row = { vendor: "VENDOR", invoice: "INVOICE", status: "FAILED", link: "LINK", note: "" };
  const widths = {
    vendor: Math.max(header.vendor.length, ...rows.map((r) => r.vendor.length)),
    invoice: Math.max(header.invoice.length, ...rows.map((r) => r.invoice.length)),
    status: Math.max("STATUS".length, ...rows.map((r) => r.status.length)),
  };
  const line = (vendor: string, invoice: string, status: string, link: string) =>
    `${vendor.padEnd(widths.vendor)} | ${invoice.padEnd(widths.invoice)} | ${status.padEnd(widths.status)} | ${link}`;

  console.log(line(header.vendor, header.invoice, "STATUS", "LINK"));
  console.log("-".repeat(widths.vendor + widths.invoice + widths.status + 12));
  for (const row of rows) {
    console.log(line(row.vendor, row.invoice, row.status, row.link || row.note));
    if (row.link && row.note) console.log(" ".repeat(widths.vendor + widths.invoice + widths.status + 6) + row.note);
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((err: unknown) => {
  // Nothing here can contain the private key: viem errors carry requests, not credentials.
  console.error(explainError(err));
  process.exit(1);
});

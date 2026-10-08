import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress, isAddress, isHex, type Hex } from "viem";
import { ReceiptView } from "@/components/receipt/ReceiptView";

type Params = { payer: string; key: string };
type Search = { v?: string | string[]; i?: string | string[] };

export const metadata: Metadata = {
  title: "Receipt",
  description: "A SettleOnce settlement, read live from the contract on Arc.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { payer, key } = await params;
  const search = await searchParams;

  if (!isAddress(payer, { strict: false })) notFound();
  if (!isHex(key) || key.length !== 66) notFound();

  const vendorRef = first(search.v)?.slice(0, 64);
  const invoiceRef = first(search.i)?.slice(0, 64);

  return (
    <ReceiptView
      payer={getAddress(payer)}
      invoiceKey={key.toLowerCase() as Hex}
      claimedRefs={vendorRef && invoiceRef ? { vendorRef, invoiceRef } : null}
    />
  );
}

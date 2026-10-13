import { createPublicClient, http } from "viem";
import { settleOnceAbi } from "@/abi/settleOnce";
import { chain, rpcUrl, settleOnceAddress } from "@/config/env";
import { explainError } from "@/lib/errors";
import { originFromRequest, paidBody, parsePaidQuery } from "@/lib/paidApi";

/**
 * GET /api/paid?payer=0x…&vendor=VENDOR-7&invoice=INV-1042
 *
 * Proof of payment for anything that speaks HTTP. The references are turned into the invoice key
 * exactly as the desk does, then the contract is read once. There is no database and no cache:
 * every answer is a fresh contract read, and the response says so (`cache-control: no-store`).
 *
 * A read that fails is a 502, never a cheerful `paid: false` — an unanswered question is not a
 * "no", and a caller must be able to tell the difference before deciding to pay.
 */
export const dynamic = "force-dynamic";

const NO_STORE = {
  "cache-control": "no-store, max-age=0, must-revalidate",
  "content-type": "application/json; charset=utf-8",
} as const;

const json = (body: unknown, status: number) =>
  new Response(`${JSON.stringify(body, null, 2)}\n`, { status, headers: NO_STORE });

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const parsed = parsePaidQuery({
    payer: params.get("payer"),
    vendor: params.get("vendor"),
    invoice: params.get("invoice"),
  });
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  if (!settleOnceAddress) {
    return json({ error: "This deployment has no SettleOnce contract configured." }, 503);
  }

  const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 1 }) });

  try {
    const settlement = await client.readContract({
      address: settleOnceAddress,
      abi: settleOnceAbi,
      functionName: "receiptFor",
      args: [parsed.query.payer, parsed.query.invoiceKey],
    });

    return json(
      paidBody({
        query: parsed.query,
        settlement: {
          recipient: settlement.recipient,
          paidAtBlock: BigInt(settlement.paidAtBlock),
          amount: BigInt(settlement.amount),
          paidAt: BigInt(settlement.paidAt),
        },
        origin: originFromRequest(request.url, request.headers),
      }),
      200,
    );
  } catch (err) {
    return json({ error: `Couldn't read ${chain.name}: ${explainError(err)}` }, 502);
  }
}

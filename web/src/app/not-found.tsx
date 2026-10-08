import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell" style={{ paddingBlock: "96px", display: "grid", gap: 16, justifyItems: "start" }}>
      <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", fontStretch: "82%" }}>Nothing on this page.</h1>
      <p>The link may be cut short. Receipt links look like /receipt/0x…payer/0x…invoiceKey.</p>
      <Link className="btn btn-signal" href="/">
        Back to the desk
      </Link>
    </div>
  );
}

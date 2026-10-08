import { network } from "@/config/env";

/** Shown when the build has no contract configured. The app never falls back to fake data. */
export function SetupNotice({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <section className="hazard" style={{ marginBottom: 32 }} aria-labelledby="setup-title">
      <div className="hazard-body">
        <h2 id="setup-title" style={{ fontSize: "1.3rem" }}>
          This build isn&apos;t connected to a SettleOnce contract yet
        </h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {problems.map((p) => (
            <li key={p} className="mono">
              {p}
            </li>
          ))}
        </ul>
        <p className="panel-note">
          Deploy the contract to Arc {network === "mainnet" ? "mainnet" : "Testnet"} with{" "}
          <span className="mono">contracts/script/DeploySettleOnce.s.sol</span>, then put the address it prints into{" "}
          <span className="mono">web/.env.local</span> (or your Vercel environment variables) and restart. Until then
          you can write and save invoices, but nothing can be read from or paid on chain.
        </p>
      </div>
    </section>
  );
}

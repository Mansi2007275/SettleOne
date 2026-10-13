"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PunchMark } from "@/components/brand/PunchMark";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NetworkBadge } from "@/components/wallet/NetworkBadge";
import { WalletButton } from "@/components/wallet/WalletButton";
import styles from "./SiteHeader.module.css";

const NAV = [
  { href: "/", label: "Desk" },
  { href: "/how", label: "How it works" },
  { href: "/ledger", label: "Ledger" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={`shell ${styles.bar}`}>
        <Link href="/" className={styles.brand} aria-label="SettleOnce home">
          <PunchMark />
          SettleOnce
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
        <div className={styles.right}>
          <NetworkBadge />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

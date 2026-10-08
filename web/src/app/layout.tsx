import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource-variable/martian-mono/standard.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { chain } from "@/config/env";

export const metadata: Metadata = {
  title: {
    default: "SettleOnce: pay each USDC invoice once",
    template: "%s | SettleOnce",
  },
  description: `Pay USDC invoices on ${chain.name} at most once per invoice, and recover what was paid after the app crashes.`,
  applicationName: "SettleOnce",
};

export const viewport: Viewport = {
  themeColor: "#2b1709",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}

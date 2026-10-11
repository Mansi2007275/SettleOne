import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource-variable/martian-mono/standard.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { chain } from "@/config/env";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "SettleOnce: pay each USDC invoice once",
    template: "%s | SettleOnce",
  },
  description: `Pay USDC invoices on ${chain.name} at most once per invoice, and recover what was paid after the app crashes.`,
  applicationName: "SettleOnce",
};

export const viewport: Viewport = {
  // Must track --page in globals.css for each theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6ebda" },
    { media: "(prefers-color-scheme: dark)", color: "#2b1709" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script adds data-theme before React hydrates, so the attribute it writes is
    // expected to differ from the server HTML.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before the first paint: picks the theme with no flash of the wrong one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
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

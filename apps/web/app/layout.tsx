import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { GmBar } from "@/components/GmBar";
import { BrandLink } from "@/components/BrandLink";
import { NavLinks } from "@/components/NavLinks";
import { FooterX } from "@/components/FooterX";
import { SiteEggs } from "@/components/SiteEggs";
import { SeasonTicker } from "@/components/SeasonTicker";
import { NewsBar } from "@/components/NewsBar";
import { latestNewsDay } from "@/lib/newsDay";

const FOOT_LINK =
  "underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]";
import { DATA_AS_OF } from "@apron/data";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.NODE_ENV === "production"
        ? "https://overtheapron.com"
        : "http://localhost:3100"),
  ),
  title: "Over the Apron — NBA Offseason, Simplified",
  description:
    "Build trades, sign free agents, and run an NBA offseason with cited 2023 CBA rules, apron limits, Bird rights, hard caps, and clear reasons for each verdict.",
  openGraph: {
    title: "Over the Apron — NBA Offseason, Simplified",
    description:
      "Build trades, sign free agents, and run an NBA offseason with cited 2023 CBA rules and clear limits.",
    images: ["/api/og?v=2"],
  },
  twitter: { card: "summary_large_image", images: ["/api/og?v=2"] },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1e9" },
    { media: "(prefers-color-scheme: dark)", color: "#17140e" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        {/* Cookieless visit + trade-run counts (Umami). Loads only when the
            site id is configured, so forks and local dev send nothing. */}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ? (
          <Script
            defer
            src="https://cloud.umami.is/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        ) : null}
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Over the Apron",
              alternateName: "NBA Offseason, Simplified",
              url: "https://overtheapron.com",
              applicationCategory: "SportsApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              description:
                "NBA trade machine and offseason simulator with cited 2023 CBA rules for apron limits, hard caps, salary matching, traded-player exceptions, and free agency.",
            }),
          }}
        />
        <SiteEggs />
        <header className="ledger-rule sticky top-0 z-20 bg-[var(--bg)]/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-3 sm:gap-5 sm:px-6">
            <BrandLink />
            <span className="hidden h-4 w-px shrink-0 bg-[var(--border-strong)] sm:block" />
            <NavLinks />
            <SeasonTicker />
          </div>
        </header>
        {/* Computed on the server: the replay is a few engine runs over data
            that only changes on a rebuild, so the client is handed the finished
            verdict rather than the machinery. */}
        <NewsBar news={latestNewsDay()} />
        <main className="mx-auto max-w-7xl px-4 py-6 pb-20 sm:px-6">
          {children}
        </main>
        <GmBar />
        <footer className="ledger-rule mx-auto max-w-7xl px-4 pb-8 pt-6 text-xs text-[var(--muted)] sm:px-6" style={{ borderTop: "1px solid var(--border)" }}>
          {/* items-center, not items-start: the follow card is taller than the
              link row, and top-aligning it left it hanging below everything
              else with dead space beside it. */}
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
                  <svg width="15" height="15" viewBox="0 0 64 64" aria-hidden>
                    <rect width="64" height="64" rx="14" fill="var(--text)" />
                    <line x1="11" y1="41" x2="53" y2="41" stroke="var(--accent)" strokeWidth="4.5" strokeDasharray="7.5 6" strokeLinecap="round" />
                    <path d="M13 54 C 20 25, 37 14, 50 22" fill="none" stroke="var(--bg)" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="50.5" cy="21.5" r="6.5" fill="var(--bg)" />
                  </svg>
                  Over the Apron
                </span>
                <span>Verdicts cite the rule when one applies.</span>
                {/* Reference pages, moved down out of the header. */}
                <Link href="/transactions" className={FOOT_LINK}>Transactions</Link>
                <Link href="/draft" className={FOOT_LINK}>Draft picks</Link>
                <Link href="/deadlines" className={FOOT_LINK}>Deadlines</Link>
                <Link href="/accuracy" className={FOOT_LINK}>Rules coverage &amp; accuracy</Link>
                <Link href="/about" className={FOOT_LINK}>About</Link>
              </div>
              <p className="tabular mt-2.5">
                {`rosters as of ${DATA_AS_OF} · independent; not affiliated with the NBA or NBPA`}
              </p>
            </div>
            <FooterX />
          </div>
        </footer>
      </body>
    </html>
  );
}

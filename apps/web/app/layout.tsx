import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { GmBar } from "@/components/GmBar";
import { BrandLink } from "@/components/BrandLink";
import { NavLinks } from "@/components/NavLinks";
import { SiteEggs } from "@/components/SiteEggs";
import { SeasonTicker } from "@/components/SeasonTicker";
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
    "Build trades, sign free agents, and run a full NBA offseason with every 2023 CBA rule enforced — apron limits, Bird rights, hard caps, and the reasons why.",
  openGraph: {
    title: "Over the Apron — NBA Offseason, Simplified",
    description:
      "Build trades, sign free agents, and run a full NBA offseason with every 2023 CBA rule enforced.",
    images: ["/api/og"],
  },
  twitter: { card: "summary_large_image" },
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
                "NBA trade machine and offseason simulator with every 2023 CBA rule enforced — apron limits, hard caps, salary matching, traded-player exceptions, and the reasons why.",
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
        <main className="mx-auto max-w-7xl px-4 py-6 pb-20 sm:px-6">
          {children}
        </main>
        <GmBar />
        <footer className="ledger-rule mx-auto max-w-7xl px-4 pb-8 pt-6 text-xs text-[var(--muted)] sm:px-6" style={{ borderTop: "1px solid var(--border)" }}>
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
            <span>Every verdict cites the 2023 CBA.</span>
            <Link href="/accuracy" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
              Rules coverage &amp; accuracy
            </Link>
            <Link href="/guide" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
              How to play
            </Link>
            <Link href="/teams" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
              Team trade machines
            </Link>
            <Link href="/terms" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
              CBA terms
            </Link>
            <span className="tabular ml-auto">{`rosters as of ${DATA_AS_OF} · 2026–27 · independent; not affiliated with the NBA or NBPA`}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

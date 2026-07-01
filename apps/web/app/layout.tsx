import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { GmBar } from "@/components/GmBar";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100",
  ),
  title: "Apron — NBA Trade & Free-Agency Simulator",
  description:
    "An NBA trade & free-agency simulator that actually encodes the 2023 CBA.",
  openGraph: {
    title: "Apron — NBA Trade & Free-Agency Simulator",
    description: "Build trades, sign free agents, and run an offseason under the real 2023 CBA.",
    images: ["/api/og"],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-3 sm:gap-6 sm:px-5">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--tier-second_apron)] text-sm font-black text-white">
                A
              </span>
              <span className="text-lg font-bold tracking-tight">Apron</span>
            </Link>
            <nav className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 font-semibold text-[var(--text)] hover:bg-[var(--panel-2)]"
              >
                Offseason
              </Link>
              <Link
                href="/league"
                className="rounded-md px-3 py-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              >
                League
              </Link>
              <Link
                href="/transactions"
                className="rounded-md px-3 py-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              >
                Transactions
              </Link>
              <Link
                href="/deadlines"
                className="rounded-md px-3 py-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              >
                Deadlines
              </Link>
              <Link
                href="/draft"
                className="rounded-md px-3 py-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              >
                Draft Picks
              </Link>
            </nav>
            <div className="ml-auto hidden shrink-0 whitespace-nowrap text-xs text-[var(--muted)] sm:block">
              2026-27 · 2023 CBA
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-6 pb-20">{children}</main>
        <GmBar />
        <footer className="mx-auto max-w-7xl px-5 py-8 text-xs text-[var(--muted)]">
          Personal project. Salary data scraped from public sources. Not
          affiliated with the NBA or NBPA.{" "}
          <Link href="/accuracy" className="underline hover:text-[var(--text)]">
            Rules coverage &amp; accuracy →
          </Link>
        </footer>
      </body>
    </html>
  );
}

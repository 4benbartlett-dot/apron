import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { GmBar } from "@/components/GmBar";

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
  title: "Apron — the NBA offseason, under the real CBA",
  description:
    "Build trades, sign free agents, and run a full NBA offseason with every 2023 CBA rule enforced — apron limits, Bird rights, hard caps, and the reasons why.",
  openGraph: {
    title: "Apron — the NBA offseason, under the real CBA",
    description:
      "Build trades, sign free agents, and run a full NBA offseason with every 2023 CBA rule enforced.",
    images: ["/api/og"],
  },
  twitter: { card: "summary_large_image" },
};

const NAV = [
  { href: "/", label: "Offseason" },
  { href: "/league", label: "League" },
  { href: "/transactions", label: "Transactions" },
  { href: "/deadlines", label: "Deadlines" },
  { href: "/draft", label: "Draft picks" },
] as const;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-3 sm:gap-5 sm:px-6">
            <Link href="/" className="flex shrink-0 items-baseline gap-2">
              <span className="grid h-6 w-6 shrink-0 translate-y-0.5 place-items-center rounded-[5px] bg-[var(--text)] text-[13px] font-bold leading-none text-[var(--bg)]">
                A
              </span>
              <span className="text-[17px] font-semibold tracking-tight">
                Apron
              </span>
            </Link>
            <span className="hidden h-4 w-px shrink-0 bg-[var(--border-strong)] sm:block" />
            <nav className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[13.5px]">
              {NAV.map((n, i) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={
                    i === 0
                      ? "rounded-md px-2.5 py-1 font-semibold text-[var(--text)] hover:bg-[var(--panel-2)]"
                      : "rounded-md px-2.5 py-1 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                  }
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="label ml-auto hidden shrink-0 whitespace-nowrap sm:block">
              2026–27 · Free agency
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 pb-20 sm:px-6">
          {children}
        </main>
        <GmBar />
        <footer className="mx-auto max-w-7xl border-t border-[var(--border)] px-4 py-6 text-xs text-[var(--muted)] sm:px-6">
          Every verdict cites the 2023 collective bargaining agreement.{" "}
          <Link
            href="/accuracy"
            className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]"
          >
            Rules coverage &amp; accuracy →
          </Link>
          <span className="ml-2">
            Independent project; not affiliated with the NBA or NBPA.
          </span>
        </footer>
      </body>
    </html>
  );
}

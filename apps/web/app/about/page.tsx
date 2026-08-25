import type { Metadata } from "next";
import Link from "next/link";
import { DATA_AS_OF } from "@apron/data";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About — Over the Apron",
  description:
    "Who builds Over the Apron, how to reach him, and where the methodology behind the CBA rule verdicts is documented.",
  alternates: { canonical: `${SITE}/about` },
};

const link =
  "underline decoration-[var(--border-strong)] underline-offset-2 transition-colors hover:text-[var(--accent-ink)]";

/** Contact rows, set on dotted leaders — the ledger device the cap sheet uses. */
const LINES: { label: string; text: string; href: string }[] = [
  { label: "Email", text: "4benbartlett@gmail.com", href: "mailto:4benbartlett@gmail.com" },
  { label: "The site on X", text: "@overtheapron", href: "https://x.com/overtheapron" },
  { label: "Ben on X", text: "@benbartlettt", href: "https://x.com/benbartlettt" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[38rem] pb-14">
      <header className="pt-2">
        <p className="label">About</p>
        <h1 className="mt-2 text-[2rem] font-bold leading-none tracking-tight">
          Over the Apron
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
          The NBA offseason, under the real CBA.
        </p>
      </header>

      <div className="rule mt-7 pt-7">
        <p className="text-[15px] leading-[1.8]">
          Most trade machines stop at salary matching. That was the easy part
          even before 2023. What decides deals now is the apron system — who can
          aggregate salaries, who can absorb one by sign-and-trade, whose
          mid-level is already gone, and which move quietly hard-caps a team for
          the rest of the year. This site is an attempt to get that part right,
          and to show its work: block a move and it names the rule, with the
          provision cited where one applies.
        </p>
      </div>

      <div className="rule mt-9 pt-7">
        <p className="label">Contact</p>
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          Built by Ben Bartlett. Corrections, missed rules, and bug reports are
          all genuinely welcome — a screenshot, or the move you were trying to
          make, helps most.
        </p>

        <ul className="mt-6 space-y-3">
          {LINES.map((l) => (
            <li key={l.href} className="leader text-[13.5px]">
              <span className="order-first shrink-0 text-[var(--muted)]">{l.label}</span>
              <a
                href={l.href}
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className={`tabular shrink-0 ${link}`}
              >
                {l.text}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="rule mt-9 pt-7">
        <p className="label">Press &amp; media</p>
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          The methodology is public.{" "}
          <Link href="/accuracy" className={link}>
            Rules coverage &amp; accuracy
          </Link>{" "}
          sets out what the engine enforces, where the public record forces an
          approximation, and which rules aren&rsquo;t on the board yet.
        </p>
      </div>

      <div className="rule mt-9 flex flex-wrap items-center justify-between gap-4 pt-7">
        <Link
          href="/"
          className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--panel)]"
        >
          Start your offseason →
        </Link>
        <p className="tabular text-[11px] text-[var(--muted)]">
          rosters as of {DATA_AS_OF}
        </p>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
        An independent project, not affiliated with or endorsed by the NBA or the
        NBPA. Player names, contracts, and transactions are compiled from public
        sources.
      </p>
    </div>
  );
}

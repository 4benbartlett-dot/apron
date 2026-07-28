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
  { label: "General", text: "overtheapron@gmail.com", href: "mailto:overtheapron@gmail.com" },
  { label: "Ben", text: "4benbartlett@gmail.com", href: "mailto:4benbartlett@gmail.com" },
  { label: "The site on X", text: "@overtheapron", href: "https://x.com/overtheapron" },
  { label: "Ben on X", text: "@benbartlettt", href: "https://x.com/benbartlettt" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[38rem] pb-14">
      <header className="pt-2">
        <p className="label">Colophon</p>
        <h1 className="mt-2 text-[2rem] font-bold leading-none tracking-tight">
          Over the Apron
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
          The NBA offseason, under the real CBA.
        </p>
      </header>

      <div className="rule mt-7 pt-7">
        <div className="space-y-4 text-[14.5px] leading-[1.75]">
          <p>
            Most trade machines stop at salary matching. That was the easy part
            even before 2023. What decides deals now is the apron system — who
            can aggregate salaries, who can absorb one by sign-and-trade, whose
            mid-level is already gone, and which move quietly hard-caps a team
            for the rest of the year. This site is an attempt to get that part
            right, and to show its work: block a move and it names the rule, with
            the provision cited where one applies.
          </p>
          <p className="text-[var(--muted)]">
            The rules engine is kept apart from the interface, so the thresholds,
            matching bands, exceptions, and hard caps are one shared body of CBA
            math rather than logic scattered through the screens — and that math
            is replayed against every real transaction of the offseason to check
            it still agrees with what actually happened. Where the public record
            forces an estimate, the estimate is{" "}
            <Link href="/accuracy" className={link}>
              published rather than hidden
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="rule mt-8 pt-7">
        <p className="label">Built by</p>
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          Ben Bartlett. Corrections, missed rules, and bug reports are all
          genuinely welcome — a screenshot, or the move you were trying to make,
          helps most.
        </p>

        <ul className="mt-5 space-y-2.5">
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

      <div className="rule mt-8 pt-7">
        <p className="label">Press &amp; media</p>
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          The methodology is public.{" "}
          <Link href="/accuracy" className={link}>
            Rules coverage &amp; accuracy
          </Link>{" "}
          sets out what the engine enforces, where the public record forces an
          approximation, and which rules aren&rsquo;t on the board yet. Worth
          reading before citing a verdict.
        </p>
      </div>

      <p className="mt-9 text-xs leading-relaxed text-[var(--muted)]">
        An independent project, not affiliated with or endorsed by the NBA or the
        NBPA. Player names, contracts, and transactions are compiled from public
        sources; rosters current to <span className="tabular">{DATA_AS_OF}</span>.
      </p>

      <Link
        href="/"
        className="mt-7 inline-block text-sm font-semibold text-[var(--accent-ink)] hover:underline"
      >
        Start your offseason →
      </Link>
    </div>
  );
}

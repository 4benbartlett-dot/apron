import type { Metadata } from "next";
import Link from "next/link";
import { DATA_AS_OF, TRANSACTIONS } from "@apron/data";
import { shortDate } from "@apron/cba-engine";
import { SITE } from "@/lib/seo";
import { C, TRADE_DEADLINE } from "@/lib/league";
import { fmtFull } from "@/lib/format";
import { CASE_NOTES } from "@/lib/caseNotes";
import { deadlineExample } from "@/lib/examples";
import { PROVISIONS, provisionForCheck } from "@/lib/provisions";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "About — Over the Apron",
  description:
    "What Over the Apron is, how a verdict is checked against the real league, who builds it, and four places the fine print of the agreement mattered.",
  alternates: { canonical: `${SITE}/about` },
  authors: [{ name: "Ben Bartlett", url: `${SITE}/about` }],
};

const link =
  "underline decoration-[var(--border-strong)] underline-offset-2 transition-colors hover:text-[var(--accent-ink)]";

/** Contact rows, set on dotted leaders — the ledger device the cap sheet uses. */
const LINES: { label: string; text: string; href: string }[] = [
  { label: "Email", text: "4benbartlett@gmail.com", href: "mailto:4benbartlett@gmail.com" },
  { label: "The site on X", text: "@overtheapron", href: "https://x.com/overtheapron" },
  { label: "Ben on X", text: "@benbartlettt", href: "https://x.com/benbartlettt" },
];

/** The builder, for a search engine deciding who "Ben Bartlett, Over the Apron" is. */
const PERSON_JSONLD = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: `${SITE}/about`,
  name: "About Over the Apron",
  mainEntity: {
    "@type": "WebApplication",
    name: "Over the Apron",
    url: SITE,
    author: { "@type": "Person", name: "Ben Bartlett", url: `${SITE}/about` },
  },
};

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A section that rises in as it is scrolled to (and is simply there for
 * anyone who prefers reduced motion, or has no JavaScript). */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section className="rule mt-9 pt-7">
        <h2 className="label">{label}</h2>
        {children}
      </section>
    </Reveal>
  );
}

export default function AboutPage() {
  const ex = deadlineExample();
  const exRule = ex ? provisionForCheck({ ruleId: "trade_eligibility", citation: ex.today.citation }) : undefined;
  return (
    <div className="mx-auto max-w-[40rem] pb-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON_JSONLD) }} />
      <header className="pt-2">
        <p className="label">About</p>
        <h1 className="mt-2 text-[2rem] font-bold leading-none tracking-tight">Over the Apron</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
          The NBA salary cap, under the real agreement.
        </p>
      </header>

      <div className="rule mt-7 pt-7">
        <p className="text-[15px] leading-[1.8]">
          Every NBA trade and signing has to satisfy the league&rsquo;s collective bargaining agreement with its
          players, a 676-page contract. This site checks a move against it. You build a trade, and it tells you whether
          the agreement allows it. When the answer is no, it names the rule and cites the article and section.
        </p>
        <p className="mt-4 text-[15px] leading-[1.8]">
          The name comes from the 2023 agreement&rsquo;s biggest change. A team&rsquo;s payroll can pass the salary cap
          ({fmtFull(C.salaryCap)} this season) through a list of permitted exceptions, but two higher lines, the
          &ldquo;aprons&rdquo; at {fmtFull(C.firstApron)} and {fmtFull(C.secondApron)}, take tools away from the teams
          above them: a team over the second can&rsquo;t combine two players&rsquo; salaries to trade for a third, for
          one. Most trade checkers compare salaries and stop. The apron rules are what decide deals now, and they are
          what this one is built around.
        </p>
      </div>

      {ex && (
        <Section label="See one decided">
          <p className="mt-2.5 text-[14.5px] leading-relaxed">
            A trade the rules block today and allow at the trade deadline. {ex.frozen.name} ({ex.frozen.teamName}) for{" "}
            {ex.partner.name} ({ex.partner.teamName}): the salaries match, and one rule stands in the way.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href={ex.today.href} className="panel block p-3.5 transition-colors hover:border-[var(--border-strong)]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="label !text-[10px]">Today · {shortDate(DATA_AS_OF)}</span>
                <span className="stamp text-[10px] text-[var(--tier-second_apron)]">Blocked</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed">{ex.today.reason}</p>
              <p className="tabular mt-2 text-[11.5px] font-semibold">{ex.today.citation}</p>
              {exRule?.text && (
                <p className="mt-1 border-l-2 border-[var(--border-strong)] pl-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  &ldquo;{exRule.text}&rdquo;
                </p>
              )}
              <p className="mt-2.5 text-[12px] font-semibold text-[var(--accent-ink)]">Open it on the board →</p>
            </Link>
            <Link href={ex.deadline.href} className="panel block p-3.5 transition-colors hover:border-[var(--border-strong)]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="label !text-[10px]">Trade deadline · {shortDate(TRADE_DEADLINE)}</span>
                <span className="stamp text-[10px] text-[var(--tier-below_cap)]">Legal</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed">
                The same trade, judged on the last day trades are allowed. His freeze lifts on{" "}
                {shortDate(ex.tradeableFrom)}, so by then nothing stands in the way.
              </p>
              <p className="mt-2.5 text-[12px] font-semibold text-[var(--accent-ink)]">Open it on the board →</p>
            </Link>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">
            This example is found in today&rsquo;s rosters each time the data updates, so it is always a trade the
            board would rule on the same way.{" "}
            <Link href="/guide" className={link}>
              How to build your own
            </Link>
            .
          </p>
        </Section>
      )}

      <Section label="How a verdict is checked">
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          The rules live in one program with no knowledge of rosters; the rosters and contracts are compiled from public
          reporting and updated through {longDate(DATA_AS_OF)}. Three things keep the two honest.
        </p>
        <ol className="mt-4 space-y-3.5 text-[14px] leading-relaxed">
          <li className="flex gap-3">
            <span className="tabular shrink-0 text-[var(--muted)]">1</span>
            <span>
              <strong className="font-semibold">Real moves have to pass.</strong> When a team makes a trade or a
              signing, it is run through the same rules a visitor&rsquo;s is. The newest are at the top of the{" "}
              <Link href="/" className={link}>
                homepage
              </Link>{" "}
              with the verdict the rules gave them, and the summer&rsquo;s are kept as permanent tests. A real move the
              rules reject means the rules, or the data, are wrong. The feed behind it holds{" "}
              {TRANSACTIONS.length.toLocaleString()}{" "}
              <Link href="/transactions" className={link}>
                transactions
              </Link>
              .
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular shrink-0 text-[var(--muted)]">2</span>
            <span>
              <strong className="font-semibold">Every payroll is compared with an outside one.</strong> All 30
              teams&rsquo; totals are checked against a public cap tracker, this season and next. Where the two differ,
              the difference has to be traced to a named player and a reason, or the check fails.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular shrink-0 text-[var(--muted)]">3</span>
            <span>
              <strong className="font-semibold">Every block names its rule.</strong> When the board says no, it gives
              the article and section and quotes the sentence that decides it. All {PROVISIONS.length} are on{" "}
              <Link href="/rules" className={link}>
                the rules page
              </Link>
              , each in plain English, and a few with a real trade the rule stops today.
            </span>
          </li>
        </ol>
      </Section>

      <Section label="Who builds it">
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          Ben Bartlett. I&rsquo;m a Warriors fan, and in the summer of 2026 the trade checkers I tried kept approving
          deals I suspected the agreement prohibits. So I started reading it, and building one that checks. It has been
          online since July 2026, and several features, traded-player exceptions among them, are there because someone
          who uses it asked.
        </p>
      </Section>

      <Section label="Where the fine print mattered">
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          Most of the agreement is easy to summarize, and the summaries are where the mistakes hide. These are rules I
          had wrong until a real transaction didn&rsquo;t fit what I had built, and the answer turned out to be in a
          clause I had read past.
        </p>
        <div className="mt-5 space-y-5">
          {CASE_NOTES.map((n) => (
            <article key={n.date}>
              <h3 className="text-[15px] font-semibold leading-snug">{n.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed">{n.body}</p>
              <p className="tabular mt-1.5 text-[11.5px] text-[var(--muted)]">{n.citation}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section label="Contact">
        <p className="mt-2.5 text-[14.5px] leading-relaxed">
          Corrections, missed rules, and bug reports are welcome. A screenshot, or the move you were trying to make,
          helps most.
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
      </Section>

      <div className="rule mt-9 flex flex-wrap items-center justify-between gap-4 pt-7">
        <Link
          href="/"
          className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--panel)]"
        >
          Open the trade board →
        </Link>
        <p className="tabular text-[11px] text-[var(--muted)]">rosters as of {DATA_AS_OF}</p>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
        An independent project, not affiliated with or endorsed by the NBA or the NBPA. Player names, contracts, and
        transactions are compiled from public sources.
      </p>
    </div>
  );
}

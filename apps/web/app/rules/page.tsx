import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";
import { PROVISIONS, PROVISION_GROUPS, provisionForCheck, type Provision } from "@/lib/provisions";
import { ruleExamples, deadlineExample, type RuleExample } from "@/lib/examples";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "The rules, by article and section — Over the Apron",
  description:
    "Every provision of the 2023 NBA collective bargaining agreement the trade board enforces: where it is, what it says in the agreement's own words, what it means in plain English, and a real trade it blocks today.",
  alternates: { canonical: `${SITE}/rules` },
};

const slug = (group: string) => group.toLowerCase().replace(/[^a-z]+/g, "-");

function Rule({ p, example, order }: { p: Provision; example?: RuleExample; order: number }) {
  return (
    // Each rule rises a beat after the one above it once its section is in view.
    <article id={p.id} className="stagger-in scroll-mt-28 px-5 py-5 sm:px-7" style={{ transitionDelay: `${Math.min(order, 6) * 70}ms` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] font-bold tracking-tight">{p.name}</h3>
        <a href={`#${p.id}`} className="tabular text-[11.5px] font-semibold text-[var(--accent-ink)] hover:underline">
          {p.cite}
        </a>
      </div>
      <p className="mt-2 max-w-[44rem] text-[14px] leading-relaxed">{p.plain}</p>
      {p.text && (
        <blockquote className="mt-3 max-w-[44rem] border-l-2 border-[var(--border-strong)] pl-3.5 text-[13px] leading-relaxed text-[var(--muted)]">
          &ldquo;{p.text}&rdquo;
        </blockquote>
      )}
      {example && (
        <Link
          href={example.href}
          className="mt-3.5 flex max-w-[44rem] items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 px-3.5 py-3 transition-colors hover:border-[var(--border-strong)]"
        >
          <span className="stamp mt-0.5 shrink-0 text-[9.5px] text-[var(--tier-second_apron)]">Blocked</span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold">{example.label}</span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--muted)]">{example.reason}</span>
            <span className="mt-1 block text-[11.5px] font-semibold text-[var(--accent-ink)]">Open it on the board →</span>
          </span>
        </Link>
      )}
    </article>
  );
}

export default function RulesPage() {
  // A real trade each rule blocks today, where one can be found in the data.
  const examples = new Map(ruleExamples());
  const freeze = deadlineExample();
  if (freeze) {
    const p = provisionForCheck({ ruleId: "trade_eligibility", citation: freeze.today.citation });
    if (p)
      examples.set(p.id, {
        label: `${freeze.frozen.name} (${freeze.frozen.team}) for ${freeze.partner.name} (${freeze.partner.team})`,
        reason: freeze.today.reason,
        href: freeze.today.href,
      });
  }

  return (
    <div className="pb-12">
      <Reveal>
        <div className="relative mb-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] px-6 py-10 sm:px-10">
          <div className="relative max-w-2xl">
            <div className="label !text-[11px] text-[var(--accent-ink)]">The rules · {PROVISIONS.length} provisions</div>
            <h1 className="mt-2 text-[clamp(26px,4.5vw,40px)] font-bold leading-[1.05] tracking-tight">
              Every verdict has an address.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              These are the provisions of the NBA&rsquo;s 2023 collective bargaining agreement that the trade board
              enforces. Each one has the article and section, a plain version, and the agreement&rsquo;s own words.
              Where today&rsquo;s rosters offer one, there is a real trade the rule blocks.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {PROVISION_GROUPS.map((g) => (
                <a
                  key={g}
                  href={`#${slug(g)}`}
                  className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-[var(--text)]"
                >
                  {g}
                </a>
              ))}
            </div>
          </div>
          <span aria-hidden className="stamp stamp-in pointer-events-none absolute right-8 top-9 hidden text-[15px] text-[var(--tier-below_cap)] md:inline-block">
            Cited
          </span>
        </div>
      </Reveal>

      <div className="space-y-6">
        {PROVISION_GROUPS.map((g) => {
          const rules = PROVISIONS.filter((p) => p.group === g);
          return (
            <Reveal key={g}>
              <section id={slug(g)} className="panel scroll-mt-28 overflow-hidden">
                <div className="flex items-baseline justify-between border-b border-[var(--border)] px-5 py-3 sm:px-7">
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.08em]">{g}</h2>
                  <span className="tabular text-[11px] text-[var(--muted)]">
                    {rules.length} {rules.length === 1 ? "rule" : "rules"}
                  </span>
                </div>
                <div className="divide-y divide-[var(--border)]/60">
                  {rules.map((p, i) => (
                    <Rule key={p.id} p={p} example={examples.get(p.id)} order={i} />
                  ))}
                </div>
              </section>
            </Reveal>
          );
        })}
      </div>

      <Reveal>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] pt-5 text-sm">
          <Link href="/" className="font-semibold text-[var(--accent-ink)] hover:underline">
            Open the trade board →
          </Link>
          <Link href="/guide" className="text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            How to play
          </Link>
          <Link href="/glossary" className="text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            Glossary
          </Link>
        </div>
      </Reveal>
    </div>
  );
}

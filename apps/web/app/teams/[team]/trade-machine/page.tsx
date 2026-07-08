import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TEAM_IDS } from "@/lib/league";
import { teamSlug, teamIdFromSlug, teamSeo, SITE } from "@/lib/seo";
import { fmtM, fmtFull } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";

export const dynamicParams = false;

export function generateStaticParams() {
  return TEAM_IDS.map((id) => ({ team: teamSlug(id) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ team: string }>;
}): Promise<Metadata> {
  const { team } = await params;
  const id = teamIdFromSlug(team);
  if (!id) return {};
  const t = teamSeo(id);
  const title = `${t.nickname} Trade Machine — 2026 Cap Sheet, Exceptions & Hard Cap`;
  const description = `${t.name} salary: ${fmtM(t.committed)} (${t.tier.replace(/_/g, " ")}). ${
    Number.isFinite(t.hardCap) ? `Hard-capped at ${fmtM(t.hardCap)} (${t.hardCapSource}). ` : ""
  }Build ${t.nickname} trades with modeled 2023 CBA checks and current roster data.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/teams/${team}/trade-machine` },
    openGraph: { title, description },
  };
}

export default async function TeamTradeMachine({ params }: { params: Promise<{ team: string }> }) {
  const { team } = await params;
  const id = teamIdFromSlug(team);
  if (!id) notFound();
  const t = teamSeo(id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: t.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Teams", item: `${SITE}/teams` },
          { "@type": "ListItem", position: 2, name: t.name, item: `${SITE}/teams/${team}/trade-machine` },
        ],
      },
    ],
  };

  return (
    <article className="mx-auto max-w-2xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="label mb-3">
        <Link href="/teams" className="hover:text-[var(--text)]">Teams</Link>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--text)]">{t.nickname}</span>
      </nav>

      <div className="flex items-center gap-3">
        <TeamLogo id={id} size={44} />
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight">{t.nickname} trade machine</h1>
          <div className="mt-1 flex items-center gap-2 text-[13px] text-[var(--muted)]">
            <span className="tabular">{fmtFull(t.committed)} committed</span>
            <TierBadge tier={t.tier} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-[14.5px] leading-relaxed">
        {t.nickname} trades here are checked against the modeled 2023 CBA rules — salary matching, apron limits,
        hard caps, and pick rules — starting from the current 2026 offseason data, not a blank slate.
        {Number.isFinite(t.hardCap) && (
          <>
            {" "}That includes the part most trade machines miss: the {t.nickname} are already{" "}
            <strong>hard-capped at {fmtM(t.hardCap)}</strong> for the season ({t.hardCapSource}).
          </>
        )}
        {t.roomTeam && (
          <>
            {" "}They operated as a cap-room team this July, so the MLE/BAE toolbox is already off the table —
            the sim arrives with that enforced.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/?team=${id}`}
          className="rounded-md bg-[var(--text)] px-3.5 py-2 text-[13px] font-semibold text-[var(--bg)] hover:opacity-90"
        >
          Build a {t.nickname} trade →
        </Link>
        <Link
          href={`/team/${id}`}
          className="rounded-md border border-[var(--border-strong)] px-3.5 py-2 text-[13px] font-semibold hover:border-[var(--text)]"
        >
          Full war room
        </Link>
      </div>

      <section className="mt-7">
        <h2 className="text-[17px] font-bold tracking-tight">What the {t.nickname} can still do</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
          {t.mechanisms.map((m, i) => (
            <div key={m.label} className={`flex items-baseline justify-between gap-3 px-3.5 py-2 text-[13px] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
              <span className="font-medium">{m.label}</span>
              <span className="tabular shrink-0 text-[var(--muted)]">up to {fmtM(m.maxSalary)}</span>
            </div>
          ))}
          {t.tpes.map((x) => (
            <div key={x.label} className="flex items-baseline justify-between gap-3 border-t border-[var(--border)] px-3.5 py-2 text-[13px]">
              <span className="font-medium">{x.label}</span>
              <span className="tabular shrink-0 text-[var(--muted)]">absorbs {fmtM(x.amount)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[var(--muted)]">
          Figures come from the current 2026 offseason feed; exceptions already spent in the feed stay spent.
        </p>
      </section>

      <section className="mt-7">
        <h2 className="text-[17px] font-bold tracking-tight">Biggest {t.nickname} salaries, 2026-27</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
          {t.topContracts.map((c, i) => (
            <div key={c.name} className={`flex items-baseline justify-between gap-3 px-3.5 py-2 text-[13px] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
              <span className="font-medium">{c.name}</span>
              <span className="tabular shrink-0 text-[var(--muted)]">{fmtM(c.salary)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-[17px] font-bold tracking-tight">Common questions</h2>
        {t.faq.map((f) => (
          <div key={f.q} className="mt-3">
            <h3 className="text-[14px] font-semibold">{f.q}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{f.a}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="label">Other teams</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TEAM_IDS.filter((x) => x !== id).map((x) => (
            <Link
              key={x}
              href={`/teams/${teamSlug(x)}/trade-machine`}
              className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[11.5px] font-semibold hover:border-[var(--text)]"
            >
              {x}
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}

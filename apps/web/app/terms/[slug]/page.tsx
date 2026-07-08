import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SEO_TERMS, termBySlug, glossaryFor, SITE } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return SEO_TERMS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const term = termBySlug(slug);
  if (!term) return {};
  return {
    title: term.metaTitle,
    description: term.metaDescription,
    alternates: { canonical: `${SITE}/terms/${term.slug}` },
    openGraph: { title: term.metaTitle, description: term.metaDescription },
  };
}

export default async function TermPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const term = termBySlug(slug);
  if (!term) notFound();
  const g = glossaryFor(term);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTerm",
        name: g.title,
        description: g.body,
        url: `${SITE}/terms/${term.slug}`,
        inDefinedTermSet: { "@type": "DefinedTermSet", name: "NBA CBA Glossary", url: `${SITE}/glossary` },
      },
      {
        "@type": "FAQPage",
        mainEntity: term.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Glossary", item: `${SITE}/glossary` },
          { "@type": "ListItem", position: 2, name: g.title, item: `${SITE}/terms/${term.slug}` },
        ],
      },
    ],
  };

  return (
    <article className="mx-auto max-w-2xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="label mb-3">
        <Link href="/glossary" className="hover:text-[var(--text)]">Glossary</Link>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--text)]">{g.title}</span>
      </nav>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">{term.question}</h1>
      <p className="mt-3 text-[15px] leading-relaxed">{g.body}</p>
      {g.cite && <p className="tabular mt-2 text-[11.5px] uppercase tracking-[0.08em] text-[var(--muted)]">{g.cite}</p>}

      {term.sections.map((s) => (
        <section key={s.heading} className="mt-7">
          <h2 className="text-[17px] font-bold tracking-tight">{s.heading}</h2>
          {s.body?.map((p, i) => (
            <p key={i} className="mt-2 text-[14px] leading-relaxed text-[var(--text)]">{p}</p>
          ))}
          {s.rows && (
            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
              {s.rows.map((r, i) => (
                <div
                  key={r.label}
                  className={`flex items-baseline justify-between gap-3 px-3.5 py-2 text-[13px] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <span className="min-w-0 font-medium">{r.label}</span>
                  <span className="tabular shrink-0 text-[var(--muted)]">{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="mt-7">
        <h2 className="text-[17px] font-bold tracking-tight">Common questions</h2>
        {term.faq.map((f) => (
          <div key={f.q} className="mt-3">
            <h3 className="text-[14px] font-semibold">{f.q}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{f.a}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-3.5">
        <p className="text-[14px] font-semibold">See it enforced, not just explained.</p>
        <p className="mt-0.5 text-[13px] text-[var(--muted)]">
          Build a trade or signing and the sim rules on it, with the relevant citation when one applies.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Link href="/" className="rounded-md bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] hover:opacity-90">
            Open the trade machine →
          </Link>
        </div>
      </div>

      <section className="mt-7">
        <h2 className="label">Related terms</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {term.related.map((slug2) => {
            const r = termBySlug(slug2);
            return r ? (
              <Link
                key={slug2}
                href={`/terms/${slug2}`}
                className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-[12.5px] font-medium hover:border-[var(--text)]"
              >
                {glossaryFor(r).title}
              </Link>
            ) : null;
          })}
          <Link href="/glossary" className="rounded-md px-2.5 py-1 text-[12.5px] font-medium text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            Full glossary
          </Link>
        </div>
      </section>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { blogPosts, postBySlug, prettyDate, BLOG_AUTHOR } from "@/lib/blog";
import { SITE } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return {};
  return {
    title: post.metaTitle,
    description: post.metaDescription,
    alternates: { canonical: `${SITE}/blog/${post.slug}` },
    authors: [{ name: BLOG_AUTHOR, url: `${SITE}/about` }],
    openGraph: {
      type: "article",
      title: post.metaTitle,
      description: post.metaDescription,
      publishedTime: post.published,
      modifiedTime: post.updated,
      authors: [BLOG_AUTHOR],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();
  const url = `${SITE}/blog/${post.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.title,
        description: post.metaDescription,
        abstract: post.answer,
        url,
        mainEntityOfPage: url,
        datePublished: post.published,
        dateModified: post.updated,
        image: `${SITE}/api/og?v=2`,
        author: { "@type": "Person", name: BLOG_AUTHOR, url: `${SITE}/about` },
        publisher: { "@type": "Organization", name: "Over the Apron", url: SITE, logo: `${SITE}/icon-512.png` },
      },
      {
        "@type": "FAQPage",
        mainEntity: post.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Blog", item: `${SITE}/blog` },
          { "@type": "ListItem", position: 2, name: post.title, item: url },
        ],
      },
    ],
  };

  return (
    <article className="mx-auto max-w-2xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="label mb-3">
        <Link href="/blog" className="hover:text-[var(--text)]">Blog</Link>
      </nav>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">{post.title}</h1>
      <p className="tabular mt-2 text-[11.5px] uppercase tracking-[0.08em] text-[var(--muted)]">
        {BLOG_AUTHOR} · {post.updated !== post.published ? `Data as of ${prettyDate(post.updated)}` : prettyDate(post.published)}
      </p>

      {/* The direct answer, before anything else — the paragraph a reader
          (or an answer engine) should be able to quote on its own. */}
      <p className="mt-4 border-l-2 border-[var(--accent)] pl-3.5 text-[15px] leading-relaxed">{post.answer}</p>

      {post.sections.map((s) => (
        <section key={s.heading} className="mt-7">
          <h2 className="text-[17px] font-bold tracking-tight">{s.heading}</h2>
          {s.body?.map((p, i) => (
            <p key={i} className="mt-2 text-[14px] leading-relaxed text-[var(--text)]">{p}</p>
          ))}
          {s.rows && s.rows.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
              {s.rows.map((r, i) => (
                <div
                  key={`${r.label}-${i}`}
                  className={`flex items-baseline justify-between gap-3 px-3.5 py-2 text-[13px] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <span className="min-w-0 font-medium">{r.label}</span>
                  <span className="tabular shrink-0 text-right text-[var(--muted)]">{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="mt-7">
        <h2 className="text-[17px] font-bold tracking-tight">Common questions</h2>
        {post.faq.map((f) => (
          <div key={f.q} className="mt-3">
            <h3 className="text-[14px] font-semibold">{f.q}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{f.a}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-3.5">
        <p className="text-[14px] font-semibold">Test a deal against these rules.</p>
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
        <h2 className="label">Related</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {post.related.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-[12.5px] font-medium hover:border-[var(--text)]"
            >
              {r.label}
            </Link>
          ))}
          <Link href="/blog" className="rounded-md px-2.5 py-1 text-[12.5px] font-medium text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            All posts
          </Link>
        </div>
      </section>
    </article>
  );
}

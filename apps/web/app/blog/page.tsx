import type { Metadata } from "next";
import Link from "next/link";
import { blogPosts, prettyDate } from "@/lib/blog";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "NBA Cap & Trade Rules Blog — Aprons, Hard Caps, TPEs | Over the Apron",
  description:
    "Answers to the NBA salary-cap questions people actually ask: which teams are over the aprons, who's hard-capped, the biggest trade exceptions, and whether a trade works.",
  alternates: { canonical: `${SITE}/blog` },
};

export default function BlogIndex() {
  const posts = blogPosts();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Over the Apron Blog",
    url: `${SITE}/blog`,
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE}/blog/${p.slug}`,
      datePublished: p.published,
      dateModified: p.updated,
    })),
  };
  return (
    <div className="mx-auto max-w-2xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-[26px] font-bold leading-tight tracking-tight">The cap, explained with current data</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        Every number on these pages comes from the same contracts and rules engine the{" "}
        <Link href="/" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">trade machine</Link>{" "}
        uses, so they update when the rosters do.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 hover:border-[var(--text)]"
          >
            <div className="text-[14.5px] font-bold leading-snug">{p.title}</div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-[var(--muted)]">{p.dek}</div>
            <div className="tabular mt-1.5 text-[10.5px] uppercase tracking-[0.08em] text-[var(--muted)]">
              {p.updated !== p.published ? `Data as of ${prettyDate(p.updated)}` : prettyDate(p.published)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

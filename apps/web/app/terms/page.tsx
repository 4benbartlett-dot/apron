import type { Metadata } from "next";
import Link from "next/link";
import { SEO_TERMS, glossaryFor, SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "NBA CBA Terms Explained — Aprons, MLEs, TPEs, Matching | Over the Apron",
  description:
    "Deep, current explainers for every apron-era CBA concept — with 2026-27 dollar figures and the real teams affected right now.",
  alternates: { canonical: `${SITE}/terms` },
};

export default function TermsIndex() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight">CBA terms, explained with live data</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        Not just definitions — each page carries the current 2026-27 dollar figures and the real teams
        affected right now, pulled from the same audited data the <Link href="/" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">trade machine</Link> enforces.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SEO_TERMS.map((t) => (
          <Link
            key={t.slug}
            href={`/terms/${t.slug}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 hover:border-[var(--text)]"
          >
            <div className="text-[14.5px] font-bold">{glossaryFor(t).title}</div>
            <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--muted)]">{t.question}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

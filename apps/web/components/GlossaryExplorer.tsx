"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GLOSSARY, type TermKey } from "@/lib/glossary";

/** Curated grouping + accent color per section of the glossary. */
const SECTIONS: { title: string; blurb: string; color: string; keys: TermKey[] }[] = [
  {
    title: "The lines",
    blurb: "The thresholds every payroll is measured against — cross one and the rules change.",
    color: "var(--tier-second_apron)",
    keys: ["cap", "tax", "below_cap", "over_cap", "taxpayer", "first_apron", "second_apron"],
  },
  {
    title: "Signing tools",
    blurb: "How teams add players when they have no cap room — every exception, from Bird rights down to the minimum.",
    color: "var(--tier-below_cap)",
    keys: ["bird", "early_bird", "non_bird", "cap_room", "ntmle", "tpmle", "room_mle", "bae", "minimum"],
  },
  {
    title: "Trade machinery",
    blurb: "What decides whether a trade is legal — matching bands, hard caps, freezes, and the pick rules.",
    color: "var(--tier-first_apron)",
    keys: ["matching", "hard_cap", "no_trade", "picks"],
  },
  {
    title: "Free agency & value",
    blurb: "The bookkeeping around free agents, and how this site prices assets.",
    color: "var(--tier-over_cap)",
    keys: ["cap_hold", "rfa", "trade_value"],
  },
];

export function GlossaryExplorer() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        keys: s.keys.filter((k) => {
          if (!query) return true;
          const g = GLOSSARY[k];
          return (
            g.title.toLowerCase().includes(query) ||
            g.body.toLowerCase().includes(query)
          );
        }),
      })).filter((s) => s.keys.length > 0),
    [query],
  );
  const total = SECTIONS.reduce((n, s) => n + s.keys.length, 0);
  const shown = filtered.reduce((n, s) => n + s.keys.length, 0);

  let idx = 0;
  return (
    <div className="pb-10">
      <div className="fade-up mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label !text-[11px] text-[var(--accent-ink)]">The 2023 CBA · plain English</div>
          <h1 className="mt-1 text-[clamp(24px,4vw,32px)] font-bold leading-tight tracking-tight">
            Glossary
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Every term the simulator uses, explained the way you&rsquo;d explain it
            to a friend — with the CBA citation when you need to win the argument.
            These same cards pop up anywhere you tap a term in the app.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm focus:border-[var(--border-strong)] focus:outline-none"
        />
      </div>

      {query && (
        <div className="fade-up mb-4 text-xs text-[var(--muted)]">
          {shown} of {total} terms match &ldquo;{q.trim()}&rdquo;
        </div>
      )}

      <div className="space-y-8">
        {filtered.map((s) => (
          <section key={s.title}>
            <div className="mb-3 flex items-baseline gap-3">
              <span className="h-3 w-3 shrink-0 translate-y-px rounded-[3px]" style={{ background: s.color }} />
              <h2 className="text-base font-bold tracking-tight">{s.title}</h2>
              <span className="hidden text-xs text-[var(--muted)] sm:block">{s.blurb}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {s.keys.map((k) => {
                const g = GLOSSARY[k];
                const delay = Math.min(idx++, 14) * 40;
                return (
                  <article
                    key={k}
                    id={k}
                    className="fade-up panel flex flex-col p-4 transition-shadow hover:shadow-[0_6px_18px_rgba(33,29,19,0.08)]"
                    style={{ animationDelay: `${delay}ms`, borderTop: `2px solid ${s.color}` }}
                  >
                    <h3 className="text-[14px] font-bold tracking-tight">{g.title}</h3>
                    <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-[var(--text)]">
                      {g.body}
                    </p>
                    {g.cite && (
                      <div className="tabular mt-3 border-t border-dashed border-[var(--border)] pt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                        {g.cite}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="fade-up mt-10 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
        Want the full audit of what the engine enforces vs. approximates?{" "}
        <Link href="/accuracy" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
          Rules coverage &amp; accuracy →
        </Link>
      </div>
    </div>
  );
}

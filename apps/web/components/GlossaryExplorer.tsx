"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GLOSSARY, type TermKey } from "@/lib/glossary";
import { TERM_SLUGS } from "@/lib/term-slugs";
import { Reveal } from "@/components/Reveal";

/** The filing cabinet: four drawers, color-coded, numbered slips inside. */
const DRAWERS: { id: string; title: string; blurb: string; color: string; keys: TermKey[] }[] = [
  {
    id: "lines",
    title: "The lines",
    blurb: "Cross one and the rules change.",
    color: "var(--tier-second_apron)",
    keys: ["cap", "tax", "below_cap", "over_cap", "taxpayer", "first_apron", "second_apron"],
  },
  {
    id: "tools",
    title: "Signing tools",
    blurb: "How teams add players without cap room.",
    color: "var(--tier-below_cap)",
    keys: ["bird", "early_bird", "non_bird", "cap_room", "ntmle", "tpmle", "room_mle", "bae", "minimum"],
  },
  {
    id: "trades",
    title: "Trade machinery",
    blurb: "What decides whether a deal is legal.",
    color: "var(--tier-first_apron)",
    keys: ["matching", "hard_cap", "no_trade", "picks"],
  },
  {
    id: "numbers",
    title: "The numbers",
    blurb: "The bookkeeping behind the cap sheet.",
    color: "var(--tier-over_cap)",
    keys: ["committed_salary", "max_salary", "yos", "raises", "cap_hold", "rfa", "trade_value"],
  },
];

export function GlossaryExplorer() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const drawers = useMemo(
    () =>
      DRAWERS.map((d) => ({
        ...d,
        keys: d.keys.filter((k) => {
          if (!query) return true;
          const g = GLOSSARY[k];
          return g.title.toLowerCase().includes(query) || g.body.toLowerCase().includes(query);
        }),
      })).filter((d) => d.keys.length > 0),
    [query],
  );
  const total = DRAWERS.reduce((n, d) => n + d.keys.length, 0);
  const shown = drawers.reduce((n, d) => n + d.keys.length, 0);

  // Global slip numbering, stable regardless of filtering.
  const numberOf = useMemo(() => {
    const m = new Map<TermKey, string>();
    let i = 1;
    for (const d of DRAWERS) for (const k of d.keys) m.set(k, String(i++).padStart(2, "0"));
    return m;
  }, []);

  return (
    <div className="pb-12">
      {/* hero */}
      <Reveal>
        <div className="relative mb-7 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] px-6 py-9 sm:px-10">
          <div className="tabular pointer-events-none absolute -right-4 -top-10 select-none text-[170px] font-bold leading-none tracking-tighter text-[var(--panel-2)]" aria-hidden>
            §
          </div>
          <div className="relative">
            <div className="label !text-[11px] text-[var(--accent-ink)]">The 2023 CBA · plain English</div>
            <h1 className="mt-2 text-[clamp(26px,4.5vw,40px)] font-bold leading-[1.05] tracking-tight">
              Glossary
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              The main terms the simulator uses, filed in four drawers —
              written plainly, with CBA references where they help. The same cards pop up anywhere you tap a
              term in the app.
            </p>
          </div>
        </div>
      </Reveal>

      {/* drawer nav + search */}
      <Reveal delay={80}>
        <div className="sticky top-[57px] z-10 -mx-4 mb-8 flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)]/92 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
          {DRAWERS.map((d) => (
            <a
              key={d.id}
              href={`#${d.id}`}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[12px] font-semibold hover:border-[var(--border-strong)]"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              {d.title}
              <span className="tabular text-[10px] text-[var(--muted)]">{d.keys.length}</span>
            </a>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${total} terms…`}
            className="ml-auto w-full max-w-[220px] rounded-full border border-[var(--border)] bg-[var(--panel)] px-3.5 py-1.5 text-[12.5px] focus:border-[var(--border-strong)]"
          />
        </div>
      </Reveal>

      {query && (
        <div className="mb-5 text-xs text-[var(--muted)]">
          {shown ? `${shown} of ${total} terms match` : "Nothing filed under"} &ldquo;{q.trim()}&rdquo;
        </div>
      )}

      <div className="space-y-10">
        {drawers.map((d) => (
          <Reveal key={d.id}>
            <section id={d.id} className="scroll-mt-28">
              {/* drawer tab */}
              <div className="drawer-tab" style={{ borderTop: `3px solid ${d.color}` }}>
                <span className="text-[13px] font-bold tracking-tight">{d.title}</span>
                <span className="hidden text-[11px] text-[var(--muted)] sm:inline">{d.blurb}</span>
              </div>
              {/* drawer body */}
              <div className="rounded-xl rounded-tl-none border border-[var(--border)] bg-[var(--panel)]/50 p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {d.keys.map((k, i) => {
                    const g = GLOSSARY[k];
                    return (
                      <article
                        key={k}
                        id={k}
                        className="term-card stagger-in flex flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"
                        style={{ transitionDelay: `${Math.min(i, 8) * 45}ms` }}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="text-[14px] font-bold tracking-tight">{g.title}</h3>
                          <span className="tabular text-[10px] font-semibold" style={{ color: d.color }}>
                            {numberOf.get(k)}
                          </span>
                        </div>
                        <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed">{g.body}</p>
                        {g.cite && (
                          <div className="leader mt-3">
                            <span className="tabular order-last shrink-0 text-[9.5px] uppercase tracking-[0.08em] text-[var(--muted)]">
                              {g.cite}
                            </span>
                          </div>
                        )}
                        {TERM_SLUGS[k] && (
                          <Link
                            href={`/terms/${TERM_SLUGS[k]}`}
                            className="mt-2 text-[11.5px] font-semibold text-[var(--accent-ink)] hover:underline"
                          >
                            Full explainer with 2026-27 figures →
                          </Link>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
          <Link href="/guide" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            How to play →
          </Link>
          <Link href="/accuracy" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            Exactly what the engine enforces vs. approximates →
          </Link>
        </div>
      </Reveal>
    </div>
  );
}

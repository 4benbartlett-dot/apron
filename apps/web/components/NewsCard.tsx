import Link from "next/link";
import { TradeDocket } from "@/components/TradeDocket";
import { TeamLogo } from "@/components/TeamLogo";
import { SEV_COLOR } from "@/lib/docket";
import { teamMeta } from "@/lib/league";
import type { NewsMove } from "@/lib/newsDay";

/** "Cleveland Cavaliers" -> "Cleveland Cavaliers’", not "Cavaliers’s". */
const possessive = (name: string) => (name.endsWith("s") ? `${name}’` : `${name}’s`);

/**
 * A real move, rendered as the filing it would be if you had staged it
 * yourself: the same masthead, verdict stamp, docket and receipt the share card
 * prints for a hypothetical trade. Nothing here is written by hand — every line
 * comes from the engine run in lib/newsDay.ts.
 */
export function NewsCard({ move, compact = false }: { move: NewsMove; compact?: boolean }) {
  const color = move.legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)";
  const stamp = move.legal
    ? move.kind === "trade" ? "Legal trade" : "Legal signing"
    : move.kind === "trade" ? "Blocked" : "Doesn't fit yet";

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      {/* masthead — the share card's, with the date standing in for the URL */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="14" fill="var(--text)" />
            <line x1="11" y1="41" x2="53" y2="41" stroke="var(--accent)" strokeWidth="4.5" strokeDasharray="7.5 6" strokeLinecap="round" />
            <path d="M13 54 C 20 25, 37 14, 50 22" fill="none" stroke="var(--bg)" strokeWidth="5" strokeLinecap="round" />
            <circle cx="50.5" cy="21.5" r="6.5" fill="var(--bg)" />
          </svg>
          <span className="text-[12.5px] font-bold tracking-tight">Real moves</span>
        </div>
        <span className="label tabular">Filed {move.dateLabel}</span>
      </div>

      {/* verdict header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5">
            {move.teams.map((t, i) => (
              <span key={t} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[11px] text-[var(--muted)]">⇄</span>}
                <TeamLogo id={t} size={20} />
              </span>
            ))}
          </div>
          <h3 className="text-[15px] font-bold leading-tight tracking-tight sm:text-[17px]">
            {move.headline}
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{move.subhead}</p>
        </div>
        <span className="stamp shrink-0 text-[13px]" style={{ color }}>
          {stamp}
        </span>
      </div>

      {/* the deal */}
      <div className="px-4 pt-3.5 sm:px-5">
        {move.docket ? (
          <TradeDocket teams={move.docket} stack maxLines={compact ? 4 : undefined} />
        ) : move.signing ? (
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-2)]/50 px-3 py-1.5">
              <span className="flex items-center gap-2 text-[12.5px] font-semibold">
                <TeamLogo id={move.signing.team} size={16} />
                {teamMeta(move.signing.team).name}
              </span>
              <span className="label">signs</span>
            </div>
            {/* Stacks on a phone: the name and the terms each need a full line
                at 375px, and side-by-side wraps both into ragged columns. */}
            <div className="flex flex-col gap-0.5 px-3 py-2 text-[13px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <span className="font-semibold">{move.signing.player}</span>
              <span className="tabular text-[var(--muted)]">
                {move.signing.years} yr · ${(move.signing.total / 1e6).toFixed(1)}M ·{" "}
                <span className="font-semibold text-[var(--text)]">
                  ${(move.signing.y1 / 1e6).toFixed(1)}M
                </span>{" "}
                year one
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* the receipt */}
      <div className="px-4 pb-1 pt-3.5 sm:px-5">
        <div className="label mb-1.5">{move.legal ? "Why it works" : "What's in the way"}</div>
        <ul className="space-y-1.5">
          {move.checks.map((c, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
              <span
                className="shrink-0 font-bold"
                style={{ color: c.ok ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}
              >
                {c.ok ? "✓" : "✗"}
              </span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* what it commits each team to */}
      {move.consequences.length > 0 && (
        <div className="px-4 pt-3.5 sm:px-5">
          <div className="label mb-1.5">What it turns on</div>
          <ul className="space-y-1.5">
            {move.consequences.map((c, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
                <span className="shrink-0 font-bold" style={{ color: SEV_COLOR[c.severity] }}>
                  ▸
                </span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* the projection — the site's own read, before and after */}
      {move.winShifts.length > 0 && (
        <div className="px-4 pt-3.5 sm:px-5">
          <div className="label mb-1.5">What it does to our win estimate</div>
          <div className="flex flex-wrap gap-1.5">
            {move.winShifts.map((w) => {
              const d = w.afterWins - w.beforeWins;
              const tone =
                d > 0 ? "var(--tier-below_cap)" : d < 0 ? "var(--tier-second_apron)" : "var(--muted)";
              return (
                <span
                  key={w.team}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[12px]"
                >
                  <TeamLogo id={w.team} size={14} />
                  <span className="tabular text-[var(--muted)]">
                    {w.beforeWins}→{w.afterWins}
                  </span>
                  <span className="tabular font-bold" style={{ color: tone }}>
                    {d > 0 ? `+${d}` : d === 0 ? "±0" : d}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* the invitation */}
      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--panel-2)]/40 px-4 py-2.5 text-[11.5px] sm:px-5">
        <span className="text-[var(--muted)]">
          Ruled by the same engine the trade machine uses.
        </span>
        <Link
          href={`/team/${move.focusTeam}`}
          className="shrink-0 font-semibold text-[var(--accent-ink)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--accent)]"
        >
          {possessive(teamMeta(move.focusTeam).name)} sheet →
        </Link>
      </div>
    </article>
  );
}

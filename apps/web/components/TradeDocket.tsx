"use client";

import { useState } from "react";
import { matchRuleLabel, classifyTier, type ApronTier, type TeamTradeSummary } from "@apron/cba-engine";
import { C, teamMeta, feedStateOf, isRowFCapped } from "@/lib/league";
import { pickShareLabel, swapShareLabel, type DecodedSwap } from "@/lib/trade-share";
import { fmtM } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { PosBadge } from "@/components/PlayerTags";
import {
  buildDocket,
  buildChecks,
  tradeConsequences,
  SEV_COLOR,
  type DocketLine,
  type DocketTeam,
  type DocketCheck,
  type MoveConsequence,
} from "@/lib/docket";

// Re-exported so existing call sites keep importing the docket from one place.
export { buildDocket, buildChecks, tradeConsequences };
export type { DocketLine, DocketTeam, DocketCheck, MoveConsequence };

export function MoveTriggers({ items }: { items: MoveConsequence[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-[var(--tier-first_apron)]/40 bg-[color-mix(in_srgb,var(--tier-first_apron)_7%,transparent)] px-3 py-2">
      <div className="label mb-1 !text-[10px] !text-[var(--accent-ink)]">Heads up — what this triggers</div>
      <ul className="space-y-1">
        {items.map((c, i) => (
          <li key={i} className="flex gap-1.5 text-[12px] leading-snug">
            <span className="shrink-0 font-bold" style={{ color: SEV_COLOR[c.severity] }}>
              {c.severity === "cap" ? "⚠" : c.severity === "restrict" ? "▸" : "·"}
            </span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Why this verdict", expandable — lives directly under the pinned docket so
 * the reasoning is always one tap away without eating the screen. */
export function DocketWhy({
  legal,
  checks,
  fix,
}: {
  legal: boolean;
  checks: DocketCheck[];
  fix?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!checks.length) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-left"
        aria-expanded={open}
      >
        <span className="label !text-[10px]">{legal ? "Why it works" : "Why it doesn't"}</span>
        <span className="text-[11px] text-[var(--muted)]">{open ? "Hide ▾" : "Show ▸"}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-2">
          <ul className="space-y-1.5">
            {checks.slice(0, 6).map((c, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
                <span className="shrink-0 font-bold" style={{ color: c.ok ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
                  {c.ok ? "✓" : "✗"}
                </span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
          {!legal && fix && (
            <p className="mt-2 border-t border-dashed border-[var(--border)] pt-2 text-[11.5px] leading-snug text-[var(--muted)]">
              <span className="font-semibold text-[var(--accent-ink)]">One route to legal:</span> {fix}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The share card's deal section, live on the board: per-team GETS/SENDS
 * columns with salaries and picks — what you see is what the card says.
 * `maxLines` collapses long columns to "+N more" instead of cutting rows. */
export function TradeDocket({
  teams,
  maxLines,
  stack = false,
}: {
  teams: DocketTeam[];
  maxLines?: number;
  /** Force single-column (the card look) instead of responsive two-up. */
  stack?: boolean;
}) {
  if (!teams.length) return null;
  return (
    <div className={`grid grid-cols-1 gap-2 ${!stack && teams.length > 1 ? "md:grid-cols-2" : ""}`}>
      {teams.map((t) => (
        <div key={t.teamId} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-2)]/50 px-3 py-1.5">
            <span className="flex items-center gap-2 text-[12.5px] font-semibold">
              <TeamLogo id={t.teamId} size={16} />
              {teamMeta(t.teamId).name}
            </span>
            <TierBadge tier={t.tier} />
          </div>
          <div className="grid grid-cols-2 divide-x divide-[var(--border)] text-xs">
            {(["gets", "sends"] as const).map((dir) => {
              const lines = t[dir];
              const shown = maxLines && lines.length > maxLines ? lines.slice(0, maxLines - 1) : lines;
              const extra = lines.length - shown.length;
              return (
                <div key={dir} className="px-3 py-2">
                  <div className="label !text-[9px]">
                    {dir === "gets" ? `Gets · ${fmtM(t.getsTotal)}` : `Sends · ${fmtM(t.sendsTotal)}`}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {shown.map((l) =>
                      l.pick ? (
                        <div key={l.label} className="tabular font-medium text-[var(--accent-ink)]">
                          {l.label}
                        </div>
                      ) : (
                        <div key={l.label} className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-baseline gap-1">
                            {l.playerId && <PosBadge playerId={l.playerId} className="self-center" />}
                            <span className="truncate">{l.label}</span>
                          </span>
                          <span className="tabular shrink-0 text-[var(--muted)]">{fmtM(l.amount ?? 0)}</span>
                        </div>
                      ),
                    )}
                    {extra > 0 && <div className="font-medium text-[var(--muted)]">+{extra} more</div>}
                    {lines.length === 0 && <span className="text-[var(--muted)]">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {t.tpeUse && (
            <div className="border-t border-dashed border-[var(--border)] px-3 py-1.5 text-[10.5px] leading-snug text-[var(--muted)]">
              <span className="font-semibold uppercase tracking-[0.08em] text-[var(--accent-ink)]">TPE</span>{" "}
              <span className="tabular">
                {t.tpeUse.label ?? "Traded-player exception"} absorbs {fmtM(t.tpeUse.amount)} ·{" "}
                {isRowFCapped(t.tpeUse) ? "pre-existing, first-apron hard cap" : "created this offseason"}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

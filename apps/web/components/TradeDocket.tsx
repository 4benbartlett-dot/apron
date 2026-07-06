"use client";

import { useState } from "react";
import { matchRuleLabel, classifyTier, type ApronTier, type TeamTradeSummary } from "@apron/cba-engine";
import { C, teamMeta, feedStateOf } from "@/lib/league";
import { pickShareLabel } from "@/lib/trade-share";
import { fmtM } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";

export interface DocketLine {
  label: string;
  amount?: number;
  pick?: boolean;
}

export interface DocketTeam {
  teamId: string;
  tier: ApronTier;
  getsTotal: number;
  sendsTotal: number;
  gets: DocketLine[];
  sends: DocketLine[];
}

/** Assemble the docket from a staged trade — the ONE source for the board,
 * the trade machine, the share modal, and the downloaded card. */
export function buildDocket(
  players: { playerId: string; from: string; to: string }[],
  picks: Record<string, { from: string; to: string }>,
  verdictTeams: { teamId: string; incomingSalary: number; outgoingSalary: number; postTradeTier: ApronTier }[],
  nameOf: (id: string) => string,
  salaryOf: (id: string) => number,
): DocketTeam[] {
  const touched = (t: string) =>
    players.some((p) => p.from === t || p.to === t) ||
    Object.values(picks).some((m) => m.from === t || m.to === t);
  return verdictTeams
    .filter((t) => touched(t.teamId))
    .map((t) => {
      const side = (dir: "to" | "from"): DocketLine[] => [
        ...players
          .filter((p) => p[dir] === t.teamId)
          .map((p) => ({ label: nameOf(p.playerId), amount: salaryOf(p.playerId) })),
        ...Object.entries(picks)
          .filter(([, m]) => m[dir] === t.teamId)
          .map(([id]) => ({ label: pickShareLabel(id), pick: true })),
      ];
      return {
        teamId: t.teamId,
        tier: t.postTradeTier,
        getsTotal: t.incomingSalary,
        sendsTotal: t.outgoingSalary,
        gets: side("to"),
        sends: side("from"),
      };
    });
}

export interface DocketCheck {
  ok: boolean;
  text: string;
}

/** The receipt lines — every rule a legal deal passes, or every reason it
 * fails. Shared by the pinned docket, the share modal, and the cards, so no
 * surface can tell a different story. */
export function buildChecks(opts: {
  legal: boolean;
  involved: TeamTradeSummary[];
  tpeUse?: Record<string, { amount: number; preExisting: boolean; label?: string }>;
  violationReasons: string[];
  extraViolations: string[];
  hasPicks: boolean;
}): DocketCheck[] {
  const { legal, involved, tpeUse, violationReasons, extraViolations, hasPicks } = opts;
  if (!legal) {
    return [
      ...violationReasons.map((text) => ({ ok: false, text })),
      ...extraViolations.map((text) => ({ ok: false, text })),
    ];
  }
  return [
    ...involved
      // Only claim a matching rule when salary actually needed matching —
      // a leg fully absorbed by a TPE is legal for a different reason.
      .filter((t) => t.incomingSalary - (t.tpeAbsorbed ?? 0) > 0)
      .map((t) => ({
        ok: true,
        text: `${t.teamId} takes back ${fmtM(t.incomingSalary)} against ${fmtM(t.outgoingSalary)} out — legal under ${matchRuleLabel(t.matchingRule, C)}`,
      })),
    ...involved
      .filter((t) => (t.tpeAbsorbed ?? 0) > 0)
      .map((t) => {
        const use = tpeUse?.[t.teamId];
        const label = use?.label ? `the ${use.label}` : "a traded-player exception";
        const kind = use ? (use.preExisting ? "pre-existing" : "created this offseason") : undefined;
        return {
          ok: true,
          text: `${t.teamId} absorbs ${fmtM(t.tpeAbsorbed!)} into ${label}${kind ? ` (${kind})` : ""} — no matching needed for that salary`,
        };
      }),
    // Row F consequence: spending a PRE-EXISTING TPE freezes the 1st apron.
    ...involved
      .filter((t) => (t.tpeAbsorbed ?? 0) > 0 && tpeUse?.[t.teamId]?.preExisting)
      .map((t) => ({
        ok: true,
        text: `${t.teamId} used a pre-existing TPE — hard-capped at the first apron (${fmtM(C.firstApron)}) for the rest of the season`,
      })),
    // Real-July hard caps the deal respects — named so readers can check.
    ...involved
      .filter((t) => t.incomingSalary > 0 && Number.isFinite(feedStateOf(t.teamId).hardCap))
      .map((t) => {
        const fs = feedStateOf(t.teamId);
        return {
          ok: true,
          text: `${t.teamId} stays ${fmtM(fs.hardCap - t.postTradeSalary)} under the hard cap from its real July moves${fs.hardCapSource ? ` (${fs.hardCapSource})` : ""}`,
        };
      }),
    ...involved
      .filter((t) => classifyTier(t.postTradeSalary, C) === "second_apron")
      .map((t) => ({
        ok: true,
        text: `${t.teamId} finishes over the second apron — no aggregation or cash used, as required`,
      })),
    ...(hasPicks
      ? [{ ok: true, text: "Stepien rule satisfied — no team left without firsts in consecutive future drafts" }]
      : []),
  ];
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
                          <span className="truncate">{l.label}</span>
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
        </div>
      ))}
    </div>
  );
}

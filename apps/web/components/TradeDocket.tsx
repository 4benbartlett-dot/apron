"use client";

import { useState } from "react";
import { matchRuleLabel, classifyTier, type ApronTier, type TeamTradeSummary } from "@apron/cba-engine";
import { C, teamMeta, feedStateOf } from "@/lib/league";
import { pickShareLabel } from "@/lib/trade-share";
import { fmtM } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { PosBadge } from "@/components/PlayerTags";

export interface DocketLine {
  label: string;
  amount?: number;
  pick?: boolean;
  playerId?: string;
}

export interface DocketTeam {
  teamId: string;
  tier: ApronTier;
  getsTotal: number;
  sendsTotal: number;
  gets: DocketLine[];
  sends: DocketLine[];
  tpeUse?: { amount: number; preExisting: boolean; label?: string };
}

/** Assemble the docket from a staged trade — the ONE source for the board,
 * the trade machine, the share modal, and the downloaded card. */
export function buildDocket(
  players: { playerId: string; from: string; to: string }[],
  picks: Record<string, { from: string; to: string }>,
  verdictTeams: { teamId: string; incomingSalary: number; outgoingSalary: number; postTradeTier: ApronTier }[],
  nameOf: (id: string) => string,
  salaryOf: (id: string) => number,
  tpeUse?: Record<string, { amount: number; preExisting: boolean; label?: string }>,
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
          .map((p) => ({ label: nameOf(p.playerId), amount: salaryOf(p.playerId), playerId: p.playerId })),
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
        tpeUse: tpeUse?.[t.teamId],
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
      .map((t) => {
        const absorbed = t.tpeAbsorbed ?? 0;
        const matchable = t.incomingSalary - absorbed;
        const subject =
          absorbed > 0
            ? `${t.teamId} matches ${fmtM(matchable)} after ${fmtM(absorbed)} TPE absorption against ${fmtM(t.outgoingSalary)} out`
            : `${t.teamId} takes back ${fmtM(t.incomingSalary)} against ${fmtM(t.outgoingSalary)} out`;
        return {
          ok: true,
          text: `${subject} — legal under ${matchRuleLabel(t.matchingRule, C)}`,
        };
      }),
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
        text: `${t.teamId} used a pre-existing TPE — hard-capped at the first apron (${fmtM(C.firstApron)}) for the rest of the league year`,
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

export interface MoveConsequence {
  team: string;
  severity: "cap" | "restrict" | "note";
  text: string;
}

/** Durable cap/rule implications of a STAGED trade — surfaced even when the
 * deal is legal, so you can see what it commits each team to: hard caps it
 * triggers, second-apron restrictions it turns on, and the two-month
 * aggregation freeze on everyone acquired. */
export function tradeConsequences(
  teams: TeamTradeSummary[],
  tpeUse: Record<string, { amount: number; preExisting: boolean; label?: string }> | undefined,
  holdsOf: (t: string) => number,
): MoveConsequence[] {
  const out: MoveConsequence[] = [];
  const cappedNew = new Set<string>();
  const name = (t: string) => teamMeta(t).name;
  const poss = (t: string) => { const n = teamMeta(t).name; return n.endsWith("s") ? `${n}'` : `${n}'s`; };
  for (const t of teams) {
    const belowAprons = t.preTradeTier !== "first_apron" && t.preTradeTier !== "second_apron";
    const matchable = t.incomingSalary - (t.tpeAbsorbed ?? 0);
    // Cap-room absorption (§6(j)(1)(v)) triggers no cap; the expanded formula
    // (row E) does — same test the session ledger uses.
    const absorption = Math.max(0, C.salaryCap - t.preTradeSalary - holdsOf(t.teamId)) + t.outgoingSalary + 250_000;
    if (belowAprons && matchable > t.outgoingSalary + 1 && matchable > absorption + 1) {
      cappedNew.add(t.teamId);
      out.push({
        team: t.teamId,
        severity: "cap",
        text: `${name(t.teamId)} is now hard-capped at the first apron (${fmtM(C.firstApron)}) for the rest of the season — it used expanded matching (took back more than 125% + $250k).`,
      });
    }
    if (!cappedNew.has(t.teamId) && (t.tpeAbsorbed ?? 0) > 0 && tpeUse?.[t.teamId]?.preExisting) {
      cappedNew.add(t.teamId);
      out.push({
        team: t.teamId,
        severity: "cap",
        text: `${name(t.teamId)} is now hard-capped at the first apron (${fmtM(C.firstApron)}) — it spent a pre-existing traded-player exception (restriction row F).`,
      });
    }
    if (t.postTradeTier === "second_apron") {
      out.push({
        team: t.teamId,
        severity: "restrict",
        text: `${name(t.teamId)} finishes over the second apron — it can no longer aggregate salaries, send cash in a trade, or use any mid-level, and its future first can be frozen.`,
      });
    } else if (t.postTradeTier === "first_apron" && !cappedNew.has(t.teamId)) {
      out.push({
        team: t.teamId,
        severity: "restrict",
        text: `${name(t.teamId)} finishes over the first apron — limited to 100% + $250k matching and the taxpayer mid-level.`,
      });
    }
    if (t.incomingSalary > 0) {
      out.push({
        team: t.teamId,
        severity: "note",
        text: `${poss(t.teamId)} incoming players can't be aggregated in another trade for ~2 months.`,
      });
    }
  }
  return out;
}

const SEV_COLOR: Record<MoveConsequence["severity"], string> = {
  cap: "var(--tier-second_apron)",
  restrict: "var(--tier-first_apron)",
  note: "var(--muted)",
};

/** "Heads up — what this triggers": the always-visible consequence strip. */
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
                {t.tpeUse.preExisting ? "pre-existing, first-apron hard cap" : "created this offseason"}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

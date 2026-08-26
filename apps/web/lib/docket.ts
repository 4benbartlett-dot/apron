import { matchRuleLabel, classifyTier, type ApronTier, type TeamTradeSummary } from "@apron/cba-engine";
import { C, teamMeta, feedStateOf, isRowFCapped } from "@/lib/league";
import { pickShareLabel, swapShareLabel, type DecodedSwap } from "@/lib/trade-share";
import { fmtM, hardCapCause } from "@/lib/format";

// ---------------------------------------------------------------------------
// The docket's PURE half: assemble a trade's ledger, its receipt of rules, and
// its durable consequences. Split out of TradeDocket.tsx so the server can call
// it — that file is "use client", and importing a plain function across that
// boundary hands a server component a client reference, not the function. The
// news cards are rendered on the server and need exactly these three.
// ---------------------------------------------------------------------------

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
  tpeUse?: { amount: number; preExisting: boolean; firstApronCap?: boolean; label?: string };
}

/** Assemble the docket from a staged trade — the ONE source for the board,
 * the trade machine, the share modal, and the downloaded card. */
export function buildDocket(
  players: { playerId: string; from: string; to: string }[],
  picks: Record<string, { from: string; to: string }>,
  verdictTeams: { teamId: string; incomingSalary: number; outgoingSalary: number; postTradeTier: ApronTier }[],
  nameOf: (id: string) => string,
  salaryOf: (id: string) => number,
  tpeUse?: Record<string, { amount: number; preExisting: boolean; firstApronCap?: boolean; label?: string }>,
  swaps: DecodedSwap[] = [],
): DocketTeam[] {
  const touched = (t: string) =>
    players.some((p) => p.from === t || p.to === t) ||
    Object.values(picks).some((m) => m.from === t || m.to === t) ||
    swaps.some((s) => s.favoredTo === t || s.otherTeam === t);
  return verdictTeams
    .filter((t) => touched(t.teamId))
    .map((t) => {
      // A swap right is incoming for the favored team ("to") and outgoing for
      // the team whose pick it encumbers ("from"), so it books on both legs.
      const swapSide = (dir: "to" | "from") =>
        swaps.filter((s) => (dir === "to" ? s.favoredTo : s.otherTeam) === t.teamId);
      const side = (dir: "to" | "from"): DocketLine[] => [
        ...players
          .filter((p) => p[dir] === t.teamId)
          .map((p) => ({ label: nameOf(p.playerId), amount: salaryOf(p.playerId), playerId: p.playerId })),
        ...Object.entries(picks)
          .filter(([, m]) => m[dir] === t.teamId)
          .map(([id]) => ({ label: pickShareLabel(id), pick: true })),
        ...swapSide(dir).map((s) => ({ label: swapShareLabel(s, t.teamId), pick: true })),
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
  tpeUse?: Record<string, { amount: number; preExisting: boolean; firstApronCap?: boolean; label?: string }>;
  violationReasons: string[];
  extraViolations: string[];
  /** An outright FIRST moved — Stepien only governs firsts, so a 2nds-only
   * deal must not claim the rule was checked. */
  hasFirsts: boolean;
}): DocketCheck[] {
  const { legal, involved, tpeUse, violationReasons, extraViolations, hasFirsts } = opts;
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
        const kind = use ? (isRowFCapped(use) ? "pre-existing" : "created this offseason") : undefined;
        return {
          ok: true,
          text: `${t.teamId} absorbs ${fmtM(t.tpeAbsorbed!)} into ${label}${kind ? ` (${kind})` : ""} — no matching needed for that salary`,
        };
      }),
    // Row F consequence: spending a Regular-Season-arisen TPE freezes the 1st
    // apron. A current-offseason-arisen TPE is exempt until next season.
    ...involved
      .filter((t) => {
        const use = tpeUse?.[t.teamId];
        return (t.tpeAbsorbed ?? 0) > 0 && use != null && isRowFCapped(use);
      })
      .map((t) => ({
        ok: true,
        text: `${t.teamId} used a traded-player exception that arose in the regular season — hard-capped at the first apron (${fmtM(C.firstApron)}) for the rest of the league year`,
      })),
    // Real-July hard caps the deal respects — named so readers can check.
    ...involved
      .filter((t) => t.incomingSalary > 0 && Number.isFinite(feedStateOf(t.teamId).hardCap))
      .map((t) => {
        const fs = feedStateOf(t.teamId);
        return {
          ok: true,
          text: `${t.teamId} stays ${fmtM(fs.hardCap - t.postTradeSalary)} under the hard cap from a real move this offseason${hardCapCause(fs.hardCapSource) ? ` (${hardCapCause(fs.hardCapSource)})` : ""}`,
        };
      }),
    ...involved
      .filter((t) => classifyTier(t.postTradeSalary, C) === "second_apron")
      .map((t) => ({
        ok: true,
        text: `${t.teamId} finish over the second apron — no aggregating and no cash, as required`,
      })),
    ...(hasFirsts
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
  tpeUse: Record<string, { amount: number; preExisting: boolean; firstApronCap?: boolean; label?: string }> | undefined,
  holdsOf: (t: string) => number,
  /** Engine rule checks — used to surface the row-H aggregation / row-I cash
   * second-apron hard caps, which finish at/below 2A so no tier change shows. */
  checks?: { ruleId?: string; ok?: boolean; teamId?: string }[],
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
        text: `${name(t.teamId)} are now hard-capped at the first apron (${fmtM(C.firstApron)}) for the rest of the season — they used expanded matching, taking back more than 100% + $250k of what they sent out.`,
      });
    }
    const use = tpeUse?.[t.teamId];
    if (!cappedNew.has(t.teamId) && (t.tpeAbsorbed ?? 0) > 0 && use != null && isRowFCapped(use)) {
      cappedNew.add(t.teamId);
      out.push({
        team: t.teamId,
        severity: "cap",
        text: `${name(t.teamId)} are now hard-capped at the first apron (${fmtM(C.firstApron)}) — they spent a traded-player exception that arose in the regular season (restriction row F).`,
      });
    }
    // Row H / row I: aggregating salaries or sending cash is LEGAL if the team
    // finishes at/below the second apron, but it hard-caps them there for the
    // season — and since the tier doesn't change, nothing else would say so.
    const aggCap = checks?.some((c) => c.ok && c.teamId === t.teamId && c.ruleId === "hard_cap_second_apron_aggregation");
    const cashCap = checks?.some((c) => c.ok && c.teamId === t.teamId && c.ruleId === "hard_cap_second_apron_cash");
    if ((aggCap || cashCap) && !cappedNew.has(t.teamId)) {
      cappedNew.add(t.teamId);
      out.push({
        team: t.teamId,
        severity: "cap",
        text: `${name(t.teamId)} are now hard-capped at the second apron (${fmtM(C.secondApron)}) for the season — they ${aggCap ? "aggregated salaries to match one incoming player (Art. VII §2(e), row H)" : "sent cash in the trade (row I)"}.`,
      });
    }
    const tier = tierConsequence(t.teamId, t.postTradeTier);
    if (tier && !(t.postTradeTier === "first_apron" && cappedNew.has(t.teamId))) out.push(tier);
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

/**
 * What a team's finishing tier costs it. Shared so a real signing that crosses
 * an apron says exactly what a staged trade that crosses it says — DeRozan's
 * minimum put Denver over the second apron, and a card that showed the new
 * number without the restrictions it turns on would be burying the story.
 */
export function tierConsequence(team: string, tier: ApronTier): MoveConsequence | null {
  const label = teamMeta(team).name;
  if (tier === "second_apron")
    return {
      team,
      severity: "restrict",
      text: `${label} are over the second apron — no aggregating salaries, no cash in a trade, no mid-level, and a future first can be frozen.`,
    };
  if (tier === "first_apron")
    return {
      team,
      severity: "restrict",
      text: `${label} are over the first apron — trades match dollar-for-dollar with no $250k cushion, and the taxpayer mid-level is the only one left.`,
    };
  return null;
}

/** Severity colours, shared by the consequence strip and the news card. */
export const SEV_COLOR: Record<MoveConsequence["severity"], string> = {
  cap: "var(--tier-second_apron)",
  restrict: "var(--tier-first_apron)",
  note: "var(--muted)",
};

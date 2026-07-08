import {
  maxIncomingSalary,
  classifyTier,
  type LeagueConstants,
  type TradeVerdict,
  type TeamTradeSummary,
  type ApronTier,
} from "@apron/cba-engine";
import { fmtM } from "./format";
import { teamMeta } from "./league";

export interface BlockedExplainer {
  /** Why this team is subject to these limits — the tier, with numbers. */
  subject: string[];
  /** Concrete routes to a legal version of the deal. */
  fixes: string[];
}

const TIER_WORD: Record<ApronTier, string> = {
  below_cap: "under the cap",
  over_cap: "over the cap",
  taxpayer: "in the luxury tax",
  first_apron: "over the first apron",
  second_apron: "over the second apron",
};

/** Ceil to the next $100k before formatting, so a quoted "fix by $X" amount
 * always clears the line when followed (fmtM's round-to-nearest can
 * understate). */
const fmtCeilM = (n: number) => fmtM(Math.ceil(n / 100_000) * 100_000);

const isSubApron = (tier: ApronTier) =>
  tier === "below_cap" || tier === "over_cap" || tier === "taxpayer";

/** The largest incoming this team could take in THIS deal and be fully legal:
 * the matching band, further capped — for sub-apron teams taking back more
 * than they send — by the first-apron hard cap that expanded matching
 * triggers (post-trade salary may not exceed 1A). */
function legalIncomingCeiling(t: TeamTradeSummary, c: LeagueConstants): number {
  const tier = classifyTier(t.preTradeSalary, c);
  let ceiling = t.maxIncomingAllowed;
  if (isSubApron(tier)) {
    // Incoming at or below outgoing never triggers the hard cap; above it,
    // post = pre − out + in must stay ≤ 1A.
    const hardCapCeiling = Math.max(
      t.outgoingSalary,
      c.firstApron - t.preTradeSalary + t.outgoingSalary,
    );
    ceiling = Math.min(ceiling, hardCapCeiling);
  }
  return ceiling;
}

/** Smallest extra outgoing salary that makes this team's leg fully legal.
 * Holding tier fixed is correct — the engine bases the matching tier on
 * PRE-trade salary. For second-apron teams the scan also requires the trade
 * to land them at or below the second apron, because adding a second outgoing
 * piece means aggregating, which is only legal below the line post-trade.
 * Returns null if $80M of extra outgoing still wouldn't do it. */
function extraOutgoingNeeded(
  t: TeamTradeSummary,
  c: LeagueConstants,
  holds = 0,
): { extra: number; shedsThroughLine: boolean } | null {
  const tier = classifyTier(t.preTradeSalary, c);
  // Kept holds consume below-cap absorption room (not apron status).
  const room = c.salaryCap - t.preTradeSalary - holds;
  for (let extra = 100_000; extra <= 80_000_000; extra += 100_000) {
    const out = t.outgoingSalary + extra;
    const post = t.preTradeSalary - out + t.incomingSalary;
    const m = maxIncomingSalary(out, tier, room, c);
    if (t.incomingSalary > m.maxIncoming + 1) continue;
    if (isSubApron(tier) && t.incomingSalary > out + 1 && post > c.firstApron + 1) continue;
    // Aggregation reality check: extra outgoing means 2+ outgoing pieces. If
    // the team would still finish above the second apron, combining salaries
    // stays forbidden — the added salary must also carry them below the line.
    const shedsThroughLine = post <= c.secondApron + 1 && t.preTradeSalary > c.secondApron;
    if (tier === "second_apron" && !shedsThroughLine) continue;
    return { extra, shedsThroughLine };
  }
  return null;
}

/** Would this leg pass if the team had first shed enough salary (in a
 * separate, earlier move) to get below the first apron? Returns the total
 * shed required, or null if even that wouldn't make the package legal. */
function shedToEscape(t: TeamTradeSummary, c: LeagueConstants, holds = 0): { shed: number; label: string } | null {
  const takeBackExtra = Math.max(0, t.incomingSalary - t.outgoingSalary);
  // Below the first apron the expanded bands apply — but taking back more
  // than you send hard-caps you at 1A, so the shed must also leave room for
  // the net salary added by THIS trade.
  const shed = t.preTradeSalary - c.firstApron + takeBackExtra + 100_000;
  if (shed <= 0) return null;
  const preAfterShed = t.preTradeSalary - shed;
  const m = maxIncomingSalary(
    t.outgoingSalary,
    classifyTier(preAfterShed, c),
    c.salaryCap - preAfterShed - holds,
    c,
  );
  if (t.incomingSalary > m.maxIncoming + 1) return null;
  return { shed, label: m.ruleLabel };
}

/** Turn a blocked verdict into plain-English "why these rules apply to this
 * team" + "what would actually make it legal" — faithful to the engine:
 * matching tier and cap room are based on PRE-trade salary; the aggregation
 * ban is based on POST-trade salary (Art. VII §2(e)(2)(i)(A)). */
export function explainBlocked(
  verdict: TradeVerdict,
  extraViolations: string[],
  c: LeagueConstants,
  /** Kept free-agent holds per team — they consume below-cap absorption
   * room, so "add more outgoing" scans must not assume phantom space. */
  holdsOf: (team: string) => number = () => 0,
): BlockedExplainer {
  const subject: string[] = [];
  const fixes: string[] = [];
  const seenTeams = new Set<string>();
  const perTeamCount = new Map<string, number>();
  const byTeam = new Map(verdict.teams.map((t) => [t.teamId, t]));

  // Cap routes per team so one team's list can't starve another's.
  const push = (teamId: string | null, text: string) => {
    const key = teamId ?? "*";
    const n = perTeamCount.get(key) ?? 0;
    if (n >= 3 || fixes.includes(text)) return;
    perTeamCount.set(key, n + 1);
    fixes.push(text);
  };

  for (const v of verdict.violations) {
    const t = v.teamId ? byTeam.get(v.teamId) : undefined;

    // --- why this team is subject to its limit -----------------------------
    if (t && !seenTeams.has(t.teamId) && (v.ruleId === "salary_matching" || v.ruleId === "second_apron_no_aggregation" || v.ruleId === "hard_cap_first_apron")) {
      seenTeams.add(t.teamId);
      const tier = classifyTier(t.preTradeSalary, c);
      const name = teamMeta(t.teamId).name;
      if (tier === "second_apron") {
        subject.push(
          `${name} count as a second-apron team here: ${fmtM(t.preTradeSalary)} in salary, ${fmtM(t.preTradeSalary - c.secondApron)} above the ${fmtM(c.secondApron)} line. Over the second apron a team may only take back 100% of what it sends — and may not combine two salaries to get there unless the trade itself drops them at or below the line.`,
        );
      } else if (tier === "first_apron") {
        subject.push(
          `${name} count as a first-apron team for this trade: ${fmtM(t.preTradeSalary)} in salary, ${fmtM(t.preTradeSalary - c.firstApron)} above the ${fmtM(c.firstApron)} line. Over either apron, matching is a strict 100% — the expanded bands only exist below the first apron.`,
        );
      } else if (v.ruleId === "salary_matching") {
        subject.push(
          `${name} are ${TIER_WORD[tier]} (${fmtM(t.preTradeSalary)}), so the expanded matching bands apply — for ${fmtM(t.outgoingSalary)} out, the ceiling is ${fmtM(t.maxIncomingAllowed)}.`,
        );
      }
    }

    // --- concrete routes to legal -------------------------------------------
    if (t && v.ruleId === "salary_matching") {
      const tid = t.teamId;
      const name = teamMeta(tid).name;
      const ceiling = legalIncomingCeiling(t, c);
      const over = t.incomingSalary - ceiling;
      if (over > 0) {
        push(tid, `Trim the incoming side: ${name} take back ${fmtCeilM(over)} less and this leg clears.`);
      }
      const need = extraOutgoingNeeded(t, c, holdsOf(tid));
      if (need) {
        push(
          tid,
          need.shedsThroughLine
            ? `Add roughly ${fmtM(need.extra)} more outgoing salary from ${name} (${fmtM(t.outgoingSalary)} → ${fmtM(t.outgoingSalary + need.extra)}) — enough that this trade itself lands them at or below the second apron, which both matches the money and makes combining salaries legal again (at the cost of a hard cap at that line).`
            : `Add roughly ${fmtM(need.extra)} more outgoing salary from ${name} (${fmtM(t.outgoingSalary)} → ${fmtM(t.outgoingSalary + need.extra)}) — enough to cover ${fmtM(t.incomingSalary)} under their band.`,
        );
      }
      const escape = shedToEscape(t, c, holdsOf(tid));
      if (escape) {
        push(
          tid,
          `Change what they are: shed ${fmtCeilM(escape.shed)} in a separate deal first. Below the first apron the expanded bands come back, and this exact package clears under ${escape.label}. (Renouncing free agents won't lower this number — apron salary counts signed contracts only. Holds only matter for under-cap absorption room.)`,
        );
      }
    }
    if (t && v.ruleId === "hard_cap_first_apron") {
      const over = t.postTradeSalary - c.firstApron;
      // "More out" only works if the enlarged outgoing still covers the
      // incoming under the band (bands are non-monotonic at the tier break).
      const outUp = t.outgoingSalary + Math.ceil(over / 100_000) * 100_000;
      const m2 = maxIncomingSalary(
        outUp,
        classifyTier(t.preTradeSalary, c),
        c.salaryCap - t.preTradeSalary,
        c,
      );
      const moreOutWorks = t.incomingSalary <= m2.maxIncoming + 1;
      push(
        t.teamId,
        `Taking back more than they send hard-caps ${teamMeta(t.teamId).name} at the first apron (${fmtM(c.firstApron)}) — this lands ${fmtCeilM(over)} past it. ${
          moreOutWorks
            ? `Rebalance by ${fmtCeilM(over)} (more out or less in), or keep incoming at or below outgoing so no hard cap triggers.`
            : `Take back ${fmtCeilM(over)} less, or keep incoming at or below outgoing so no hard cap triggers.`
        }`,
      );
    }
    if (t && v.ruleId === "second_apron_no_aggregation") {
      const gap = t.postTradeSalary - c.secondApron;
      push(
        t.teamId,
        `No single outgoing salary covers the incoming piece, and combining salaries is forbidden while the team finishes over the second apron. Routes: restructure so each incoming player fits inside one outgoing salary, or send roughly ${fmtCeilM(gap)} more salary out in this same deal — landing at or below the line makes aggregation legal (and hard-caps them there) — or shed it in a separate move first.`,
      );
    }
    if (v.ruleId === "no_aggregate") {
      push(
        v.teamId ?? null,
        "A just-acquired player can't be combined with other salaries for ~2 months — send him alone (a one-for-one leg is fine), or build the package around someone else.",
      );
    }
    if (v.ruleId === "second_apron_no_cash_out") {
      push(v.teamId ?? null, "Drop the cash: a team finishing over the second apron may not send cash in any trade.");
    }
    if (v.ruleId === "minimum_traded_player_aggregation") {
      push(
        v.teamId ?? null,
        "This package aggregates multiple minimum-salary players outside the Dec. 15-to-trade-deadline window. Make only one minimum player part of the aggregated outgoing side, turn it into separate one-for-one legs, or wait until the Dec. 15-to-deadline window when this specific restriction opens up.",
      );
    }
    if (v.ruleId === "trade_eligibility" || /not trade-eligible|cannot be traded/i.test(v.reason)) {
      const who = v.reason.match(/^([A-ZÀ-ž][\w'.\- À-ž]+?) cannot be traded/)?.[1];
      push(
        v.teamId ?? null,
        `${who ?? "That player"} is inside a trade freeze — drop him from the deal, or wait out the date in the verdict.`,
      );
    }
  }

  for (const ev of extraViolations) {
    if (/hard-capped .* by its real July moves/i.test(ev)) {
      // Real-world cap — nothing in the sim to undo.
      push(
        null,
        "That hard cap comes from the team's real July moves, so there's nothing to undo — send out more salary in this deal, or route the incoming player to a team with room under its line.",
      );
    } else if (/hard-capped .* from a move you made|hard-capped .* from an earlier move/i.test(ev)) {
      push(
        null,
        "That hard cap came from a move you already made this offseason (check the moves bar) — undo it, or shrink this deal to fit under the line it froze.",
      );
    }
    if (/Stepien/i.test(ev)) {
      const owed = ev.match(/(\d{4}) first is already owed/)?.[1];
      const offending = ev.match(/trading the (\d{4}) first/i)?.[1];
      push(
        null,
        owed && offending
          ? `The ${owed} first is already gone in the real world — that's fixed. Swap the outgoing ${offending} first to a non-consecutive year (or a second) and the Stepien rule is satisfied.`
          : "Keep a first in every other draft: swap one of the outgoing firsts to a non-consecutive year (or a second) and the Stepien rule is satisfied.",
      );
    }
  }

  return {
    subject: [...new Set(subject)].slice(0, 3),
    fixes: fixes.slice(0, 6),
  };
}

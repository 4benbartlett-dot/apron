import type { ApronTier, LeagueConstants } from "./types";

export interface MatchResult {
  /** Maximum incoming salary the acquiring team may absorb. */
  maxIncoming: number;
  /** Machine identifier for which matching rule applied (stable, for tests). */
  rule: string;
  /** Human-readable name of the applied rule, for user-facing copy. */
  ruleLabel: string;
}

export interface MatchOptions {
  /**
   * The flat allowance in Art. VII §6(j). It is normally $250,000, but §6(j)(3)
   * reduces it to $0 if the team's post-assignment Apron Team Salary would
   * exceed the first apron.
   */
  addOn?: number;
}

/** Display names for the matching rules — what users see in verdicts.
 * Year-agnostic: the middle band's dollar figure escalates with the cap
 * (Art. VII §6(j)(1)(iv)) — use `matchRuleLabel(rule, c)` for exact dollars. */
export const MATCH_RULE_LABEL: Record<string, string> = {
  first_apron_100pct: "100% matching — first-apron team",
  second_apron_100pct: "100% matching — second-apron team",
  expanded_tier1_200pct: "expanded matching, 200% + $250k band",
  expanded_tier2_flat: "expanded matching, outgoing + escalated-$7.5M band",
  expanded_tier3_125pct: "expanded matching, 125% + $250k band",
  cap_room_absorption: "absorbed into cap room",
};

/** Rule label with the year's exact escalated dollar figure filled in. */
export function matchRuleLabel(rule: string, c: LeagueConstants): string {
  if (rule === "expanded_tier2_flat") {
    const m = (c.tradeMatch.escalatedFlatAddOn / 1_000_000).toFixed(1);
    return `expanded matching, outgoing + $${m}M band`;
  }
  return MATCH_RULE_LABEL[rule] ?? rule;
}

/**
 * Maximum salary a team may take back, given how much it sends out and its
 * apron tier *before* the trade.
 *
 * Key correctness points vs. competing trade machines:
 *  - Teams BELOW the first apron use the 2023 CBA expanded formula,
 *    Art. VII §6(j)(1)(iv) (p. 241), applied verbatim:
 *      greater of ( lesser of (200%·out + $250k, out + $7.5M×capGrowth),
 *                   125%·out + $250k )
 *    Only the $7.5M escalates with the cap (÷ the 2023-24 cap); the $250k
 *    amounts are flat. The familiar "$7.5M / $29M breakpoints" are just the
 *    2023-24 crossovers of these formulas — they scale with the cap too.
 *  - Teams AT/ABOVE either apron are limited to 100% (dollar-for-dollar).
 *    There is NO 110% — that was a 2023-24 transition-only rule and is dead.
 *  - Under-cap teams absorb salary using cap room (room first), then match.
 *
 * Note: this returns the matching *ceiling* only. The separate hard-cap rule
 * (taking back > 100% hard-caps you at the first apron) is enforced in
 * `validateTrade`, not here.
 */
export function maxIncomingSalary(
  outgoing: number,
  tier: ApronTier,
  capRoom: number,
  c: LeagueConstants,
  opts: MatchOptions = {},
): MatchResult {
  // Apron teams: strict 100%. No expanded bands, no aggregation premium.
  if (tier === "first_apron") {
    return { maxIncoming: outgoing, rule: "first_apron_100pct", ruleLabel: MATCH_RULE_LABEL.first_apron_100pct! };
  }
  if (tier === "second_apron") {
    return { maxIncoming: outgoing, rule: "second_apron_100pct", ruleLabel: MATCH_RULE_LABEL.second_apron_100pct! };
  }

  // Over-the-cap expanded traded-player formula, per the CBA text.
  const addOn = opts.addOn ?? c.tradeMatch.addOn;
  const { escalatedFlatAddOn } = c.tradeMatch;
  const doubled = outgoing * 2 + addOn; //            (y)(A) 200% + $250k
  const flat = outgoing + escalatedFlatAddOn; //      (y)(B) 100% + $7.5M×growth
  const stretched = outgoing * 1.25 + addOn; //       (z)    125% + $250k
  const expanded = Math.max(Math.min(doubled, flat), stretched);
  const rule =
    expanded === stretched && stretched > Math.min(doubled, flat)
      ? "expanded_tier3_125pct"
      : doubled <= flat
        ? "expanded_tier1_200pct"
        : "expanded_tier2_flat";
  // A team below the cap may absorb into room and finish up to $250k over the
  // cap (the 2023-CBA "room" allowance — raised from $100k in the prior CBA).
  // It may alternatively use standard matching, so take the greater. The
  // separate first-apron hard-cap check in validateTrade still applies.
  if (tier === "below_cap") {
    const absorption = outgoing + Math.max(0, capRoom) + addOn;
    if (absorption >= expanded) {
      return { maxIncoming: absorption, rule: "cap_room_absorption", ruleLabel: MATCH_RULE_LABEL.cap_room_absorption! };
    }
  }
  return { maxIncoming: expanded, rule, ruleLabel: matchRuleLabel(rule, c) };
}

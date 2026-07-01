import type { ApronTier, LeagueConstants } from "./types";

export interface MatchResult {
  /** Maximum incoming salary the acquiring team may absorb. */
  maxIncoming: number;
  /** Identifier for which matching rule applied (for the explain panel). */
  rule: string;
}

/**
 * Maximum salary a team may take back, given how much it sends out and its
 * apron tier *before* the trade.
 *
 * Key correctness points vs. competing trade machines:
 *  - Teams BELOW the first apron use the 2023 CBA expanded bands
 *    (200% + $250k / outgoing + $7.5M / 125% + $250k).
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
): MatchResult {
  // Apron teams: strict 100%. No expanded bands, no aggregation premium.
  if (tier === "first_apron") {
    return { maxIncoming: outgoing, rule: "first_apron_100pct" };
  }
  if (tier === "second_apron") {
    return { maxIncoming: outgoing, rule: "second_apron_100pct" };
  }

  // Over-the-cap expanded traded-player bands.
  const { tier1Ceiling, tier2Ceiling, addOn, tier2FlatAddOn } = c.tradeMatch;
  let expanded: number;
  let rule: string;
  if (outgoing <= tier1Ceiling) {
    expanded = outgoing * 2 + addOn;
    rule = "expanded_tier1_200pct";
  } else if (outgoing <= tier2Ceiling) {
    expanded = outgoing + tier2FlatAddOn;
    rule = "expanded_tier2_flat";
  } else {
    expanded = outgoing * 1.25 + addOn;
    rule = "expanded_tier3_125pct";
  }

  // A team below the cap may absorb into room and finish up to $250k over the
  // cap (the 2023-CBA "room" allowance — raised from $100k in the prior CBA).
  // It may alternatively use standard matching, so take the greater. The
  // separate first-apron hard-cap check in validateTrade still applies.
  if (tier === "below_cap") {
    const absorption = outgoing + Math.max(0, capRoom) + 250_000;
    if (absorption >= expanded) {
      return { maxIncoming: absorption, rule: "cap_room_absorption" };
    }
  }
  return { maxIncoming: expanded, rule };
}

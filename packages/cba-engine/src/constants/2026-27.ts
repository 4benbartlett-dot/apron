import type { LeagueConstants } from "../types";

/**
 * 2026-27 league-year constants — OFFICIAL (set at the league-year open,
 * June 30, 2026). Cap rose +$10,314,000 (+6.669%) to $164,961,000.
 *
 * Cap / floor / tax / aprons / MLEs are the official cap-memo figures. The
 * minimum-salary table follows Art. I (jj): each year's scale is the prior
 * year's scale grown by the cap's percentage increase (×164,961/154,647 —
 * confirmed against the CBA text; an earlier version of this file used a
 * flat +7.0% and ran ~$8–12k hot on every row). The Bi-Annual Exception is
 * 3.32% of the cap rounded to the nearest $1,000.
 */
const CAP = 164_961_000;
const CAP_2023_24 = 136_021_000; // escalation denominator (Art. VII §6(j))

export const SEASON_2026_27: LeagueConstants = {
  leagueYear: "2026-27",
  official: true,

  salaryCap: CAP,
  minTeamSalary: 148_465_000,
  luxuryTaxLine: 200_428_000,
  firstApron: 209_015_000,
  secondApron: 221_686_000,

  nonTaxpayerMLE: 15_044_000,
  taxpayerMLE: 6_064_000,
  roomMLE: 9_366_000,
  biAnnualException: 5_477_000, // 3.32% of cap, rounded to the nearest $1,000

  // Approximate CBA estimated average player salary (~ total salaries / players);
  // used for the Early Bird alternative. Refine when the official figure posts.
  estimatedAverageSalary: 13_200_000,

  maxSalary: {
    "0-6": Math.round(CAP * 0.25), // $41,240,250
    "7-9": Math.round(CAP * 0.3), //  $49,488,300
    "10+": Math.round(CAP * 0.35), // $57,736,350
  },

  tradeMatch: {
    addOn: 250_000, // flat — the CBA does not escalate the $250k
    escalatedFlatAddOn: Math.round((7_500_000 * CAP) / CAP_2023_24), // $9,095,709
  },

  // 2026-27 minimum scale = 2025-26 scale × cap growth (Art. I (jj)).
  minimumSalaries: {
    0: 1_357_763,
    1: 2_185_116,
    2: 2_449_421,
    3: 2_537_526,
    4: 2_625_627,
    5: 2_845_883,
    6: 3_066_143,
    7: 3_286_399,
    8: 3_506_659,
    9: 3_524_115,
    10: 3_876_529, // 10+ years
  },
};

/** @deprecated kept for back-compat; the 2026-27 numbers are now official. */
export const SEASON_2026_27_PROJECTED = SEASON_2026_27;

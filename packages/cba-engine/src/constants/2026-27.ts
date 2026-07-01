import type { LeagueConstants } from "../types";

/**
 * 2026-27 league-year constants — OFFICIAL (set at the league-year open,
 * June 30, 2026). Cap rose +$10,314,000 (+6.669%) to $164,961,000.
 *
 * Cap / floor / tax / aprons / MLEs are the official cap-memo figures. The
 * minimum-salary table follows the CBA minimum scale (a clean +7.0% over
 * 2025-26, not the cap dollar ratio). The Bi-Annual Exception is 3.32% of the
 * cap rounded to the nearest $1,000 (164,961,000 × 0.0332 → 5,477,000).
 */
const CAP = 164_961_000;

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
    tier1Ceiling: 7_500_000,
    tier2Ceiling: 29_000_000,
    addOn: 250_000,
    tier2FlatAddOn: 7_500_000,
  },

  // Official 2026-27 minimum scale (+7.0% over 2025-26).
  minimumSalaries: {
    0: 1_361_969,
    1: 2_191_886,
    2: 2_457_010,
    3: 2_545_388,
    4: 2_633_762,
    5: 2_854_699,
    6: 3_075_642,
    7: 3_296_581,
    8: 3_517_523,
    9: 3_535_034,
    10: 3_888_538, // 10+ years
  },
};

/** @deprecated kept for back-compat; the 2026-27 numbers are now official. */
export const SEASON_2026_27_PROJECTED = SEASON_2026_27;

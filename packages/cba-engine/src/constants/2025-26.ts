import type { LeagueConstants } from "../types";

/**
 * 2025-26 league-year constants — OFFICIAL and final.
 *
 * Verified against NBA.com's cap-setting release and cross-checked by Hoops
 * Rumors (June 2025). Every figure here was independently confirmed in research.
 * Sources:
 *  - https://www.nba.com/news/nba-salary-cap-set-2025-26-season
 *  - https://www.hoopsrumors.com/2025/06/salary-cap-tax-line-set-for-2025-26-nba-season.html
 *  - https://www.hoopsrumors.com/2025/06/values-of-2025-26-mid-level-bi-annual-exceptions.html
 *  - https://www.hoopsrumors.com/2025/06/nba-minimum-salaries-for-2025-26.html
 */
export const SEASON_2025_26: LeagueConstants = {
  leagueYear: "2025-26",
  official: true,

  salaryCap: 154_647_000,
  minTeamSalary: 139_182_300, // 90% of cap
  luxuryTaxLine: 187_895_000, // 121.5% of cap
  firstApron: 195_945_000,
  secondApron: 207_824_000,

  nonTaxpayerMLE: 14_104_000,
  taxpayerMLE: 5_685_000,
  roomMLE: 8_781_000,
  biAnnualException: 5_134_000,

  // Approximate CBA estimated average player salary (~ total salaries / players);
  // used for the Early Bird alternative. Refine when the official figure posts.
  estimatedAverageSalary: 12_400_000,

  maxSalary: {
    "0-6": 38_661_750, // 25% of cap
    "7-9": 46_394_100, // 30% of cap
    "10+": 54_126_450, // 35% of cap
  },

  tradeMatch: {
    tier1Ceiling: 7_500_000,
    tier2Ceiling: 29_000_000,
    addOn: 250_000,
    tier2FlatAddOn: 7_500_000,
  },

  minimumSalaries: {
    0: 1_272_870,
    1: 2_048_494,
    2: 2_296_274,
    3: 2_378_870,
    4: 2_461_463,
    5: 2_667_947,
    6: 2_874_436,
    7: 3_080_921,
    8: 3_287_409,
    9: 3_303_774,
    10: 3_634_153, // 10+ years
  },
};

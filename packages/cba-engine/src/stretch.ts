import type { LeagueConstants } from "./types";

export interface StretchResult {
  /** Number of seasons the remaining dead money is spread over. */
  years: number;
  /** Annual dead-money cap hit after stretching. */
  perYear: number;
  /**
   * False if this contract's stretched per-year hit alone would exceed 15% of
   * the cap. (The CBA's guardrail is on the team's TOTAL stretched salary in a
   * year, so this is a necessary — not fully sufficient — check.)
   */
  legal: boolean;
}

/**
 * Stretch provision (2023 CBA Art. VII §7, printed p. 258): a waived player's
 * remaining guaranteed salary may be spread over twice the number of remaining
 * seasons plus one. A team may not stretch if the resulting dead money in any
 * future year would exceed 15% of that year's Salary Cap.
 */
export function stretchProvision(
  remainingSalary: number,
  remainingSeasons: number,
  c: LeagueConstants,
): StretchResult {
  const years = Math.max(1, 2 * Math.max(0, remainingSeasons) + 1);
  const perYear = remainingSalary / years;
  return { years, perYear, legal: perYear <= c.salaryCap * 0.15 };
}

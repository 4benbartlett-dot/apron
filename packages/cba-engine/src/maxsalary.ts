import type { BirdStatus, LeagueConstants } from "./types";

/** First-year maximum salary by years of service (25% / 30% / 35% tiers). */
export function maxSalaryTier(yearsOfService: number, c: LeagueConstants): number {
  if (yearsOfService <= 6) return c.maxSalary["0-6"];
  if (yearsOfService <= 9) return c.maxSalary["7-9"];
  return c.maxSalary["10+"];
}

/**
 * The most a player can earn in year one, given years of service and prior
 * salary: the GREATER of his tier maximum or 105% of his prior salary.
 */
export function playerMaxSalary(
  yearsOfService: number,
  priorSalary: number,
  c: LeagueConstants,
): number {
  return Math.max(maxSalaryTier(yearsOfService, c), priorSalary * 1.05);
}

/**
 * Maximum a player can RE-SIGN for with his own team, by Bird sub-type:
 *  - Bird: up to his max salary (greater of tier% or 105% of prior).
 *  - Early Bird: greater of 175% of prior salary or 105% of the estimated
 *    average salary — capped at his max.
 *  - Non-Bird: greater of 120% of prior salary or 120% of the applicable
 *    minimum salary — capped at his max.
 */
export function reSignMax(
  birdStatus: BirdStatus,
  priorSalary: number,
  yearsOfService: number,
  c: LeagueConstants,
): number {
  const absoluteMax = playerMaxSalary(yearsOfService, priorSalary, c);
  if (birdStatus === "early_bird") {
    return Math.min(
      absoluteMax,
      Math.max(priorSalary * 1.75, c.estimatedAverageSalary * 1.05),
    );
  }
  if (birdStatus === "non_bird") {
    // 120% of prior OR 120% of the applicable minimum, whichever is greater.
    const minIdx = Math.min(Math.max(Math.floor(yearsOfService), 0), 10);
    const minSalary = c.minimumSalaries[minIdx] ?? c.minimumSalaries[10] ?? 0;
    return Math.min(absoluteMax, Math.max(priorSalary * 1.2, minSalary * 1.2));
  }
  // full Bird (or unknown): up to the player's max salary.
  return absoluteMax;
}

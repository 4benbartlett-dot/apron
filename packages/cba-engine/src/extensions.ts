import type { LeagueConstants } from "./types";
import { playerMaxSalary } from "./maxsalary";

/**
 * Maximum first-year salary of a standard VETERAN EXTENSION (2023 CBA Art. VII
 * §7(a), printed p. 251): the GREATER of 140% of the final-year Regular Salary
 * of the original contract or 140% of the estimated average salary, capped at
 * the player's maximum. Subsequent years may move ±8% of the first new year.
 */
export function veteranExtensionMax(
  priorFinalSalary: number,
  yearsOfService: number,
  c: LeagueConstants,
): number {
  const ceiling = Math.max(priorFinalSalary * 1.4, c.estimatedAverageSalary * 1.4);
  return Math.min(playerMaxSalary(yearsOfService, priorFinalSalary, c), ceiling);
}

/**
 * Maximum first-year salary of an EXTEND-AND-TRADE (2023 CBA Art. VII §8(e)(2),
 * printed p. 252): the GREATER of 120% of the final-year salary or 120% of the
 * estimated average salary, capped at the max. Extend-and-trades also limit
 * added term and use 5% raises.
 */
export function extendAndTradeMax(
  priorFinalSalary: number,
  yearsOfService: number,
  c: LeagueConstants,
): number {
  const ceiling = Math.max(priorFinalSalary * 1.2, c.estimatedAverageSalary * 1.2);
  return Math.min(playerMaxSalary(yearsOfService, priorFinalSalary, c), ceiling);
}

/**
 * Maximum first-year salary after a RENEGOTIATION (2023 CBA Art. VII §7(c),
 * printed p. 255). ONLY a team with Room under the cap may renegotiate, and the
 * raise is limited to the team's Room; the renegotiated salary is still capped
 * at the player's maximum. Returns the current salary unchanged when the team
 * has no Room (renegotiation is not permitted).
 */
export function renegotiationMax(
  committedTeamSalary: number,
  currentSalary: number,
  yearsOfService: number,
  c: LeagueConstants,
): number {
  const room = c.salaryCap - committedTeamSalary;
  if (room <= 0) return currentSalary; // no Room → cannot renegotiate
  return Math.min(
    playerMaxSalary(yearsOfService, currentSalary, c),
    currentSalary + room,
  );
}

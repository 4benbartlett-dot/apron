import type { BirdStatus, LeagueConstants } from "./types";

/**
 * Free-agent cap hold ("Free Agent Amount"), by Bird status (2023 CBA Art. VII
 * §4(d), printed pp. 217-218):
 *  - Non-Bird: 120% of prior salary.
 *  - Early Bird: 130% of prior salary.
 *  - Bird (Qualifying Veteran FA): 150% of prior salary if it was ≥ the
 *    estimated average salary, else 190%.
 * Clamped between a minimum-salary floor and the player's max. Callers that
 * don't track a player's Bird status get the full-Bird figure (the common case
 * for a team's own veteran free agents).
 *
 * This is what makes the offseason cap board realistic: a team's own free agents
 * occupy room until they're re-signed or renounced.
 */
export function capHold(
  lastSalary: number,
  c: LeagueConstants,
  birdStatus: BirdStatus = "bird",
): number {
  if (lastSalary <= 0) return 0;
  let hold: number;
  if (birdStatus === "non_bird") {
    hold = lastSalary * 1.2;
  } else if (birdStatus === "early_bird") {
    hold = lastSalary * 1.3;
  } else {
    hold = lastSalary * (lastSalary >= c.estimatedAverageSalary ? 1.5 : 1.9);
  }
  const max = c.maxSalary["10+"];
  const floor = c.minimumSalaries[2] ?? 0;
  return Math.round(Math.min(max, Math.max(floor, hold)));
}

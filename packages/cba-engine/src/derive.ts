import type {
  ApronTier,
  Contract,
  LeagueConstants,
  LeagueData,
} from "./types";

/** Salary/cap hit for a contract in a given league year (0 if no year row). */
export function salaryForYear(contract: Contract, leagueYear: string): number {
  const row = contract.years.find((y) => y.leagueYear === leagueYear);
  return row ? row.salary : 0;
}

/** Find a single contract by player id. */
export function findContract(
  data: LeagueData,
  playerId: string,
): Contract | undefined {
  return data.contracts.find((c) => c.playerId === playerId);
}

/** Total team salary for a league year = sum of its contracts' cap hits. */
export function teamSalary(
  data: LeagueData,
  teamId: string,
  leagueYear: string = data.leagueYear,
): number {
  return data.contracts
    .filter((c) => c.teamId === teamId)
    .reduce((sum, c) => sum + salaryForYear(c, leagueYear), 0);
}

/**
 * Classify a salary figure against the four thresholds. The 2023 CBA taxes and
 * restricts a team only when its salary *exceeds* (is strictly greater than) a
 * line — a team exactly at the tax line, first apron, or second apron is NOT
 * over it. These strict `>` comparisons match the `is*` boolean flags on the
 * cap sheet below. The salary-cap boundary is inclusive: a team exactly at the
 * cap has $0 room and operates as an over-the-cap team (with MLE access).
 */
export function classifyTier(
  salary: number,
  c: LeagueConstants,
): ApronTier {
  if (salary > c.secondApron) return "second_apron";
  if (salary > c.firstApron) return "first_apron";
  if (salary > c.luxuryTaxLine) return "taxpayer";
  if (salary >= c.salaryCap) return "over_cap";
  return "below_cap";
}

export interface CapSheet {
  teamId: string;
  leagueYear: string;
  salary: number;
  tier: ApronTier;
  /** Positive = room under the cap; negative = over the cap. */
  capRoom: number;
  spaceBelowTax: number;
  spaceBelowFirstApron: number;
  spaceBelowSecondApron: number;
  isOverCap: boolean;
  isTaxpayer: boolean;
  isOverFirstApron: boolean;
  isOverSecondApron: boolean;
}

/** Full derived cap sheet for one team. */
export function capSheet(
  data: LeagueData,
  teamId: string,
  c: LeagueConstants,
): CapSheet {
  const salary = teamSalary(data, teamId, c.leagueYear);
  return {
    teamId,
    leagueYear: c.leagueYear,
    salary,
    tier: classifyTier(salary, c),
    capRoom: c.salaryCap - salary,
    spaceBelowTax: c.luxuryTaxLine - salary,
    spaceBelowFirstApron: c.firstApron - salary,
    spaceBelowSecondApron: c.secondApron - salary,
    isOverCap: salary > c.salaryCap,
    isTaxpayer: salary > c.luxuryTaxLine,
    isOverFirstApron: salary > c.firstApron,
    isOverSecondApron: salary > c.secondApron,
  };
}

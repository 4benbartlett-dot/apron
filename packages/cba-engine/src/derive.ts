import type {
  ApronTier,
  ApronTeamSalaryAdjustments,
  Contract,
  LeagueConstants,
  LeagueData,
} from "./types";

/** Salary/cap hit for a contract in a given league year (0 if no year row). */
export function salaryForYear(contract: Contract, leagueYear: string): number {
  const row = contract.years.find((y) => y.leagueYear === leagueYear);
  return row ? row.salary : 0;
}

/** Matching/deemed salary for traded-player-exception calculations. */
export function tradeSalaryForYear(contract: Contract, leagueYear: string): number {
  const row = contract.years.find((y) => y.leagueYear === leagueYear);
  return row ? (row.tradeSalary ?? row.salary) : 0;
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
 * A single contract's contribution to Apron Team Salary. This starts with the
 * ordinary cap hit, adds excluded performance bonuses, and applies the 0/1-YOS
 * free-agent minimum addback from Art. VII §2(d)(1)(i)(F), which Art. VII
 * §2(e)(1)(ii) incorporates into Apron Team Salary.
 */
export function apronSalaryForYear(
  contract: Contract,
  c: LeagueConstants,
): number {
  const row = contract.years.find((y) => y.leagueYear === c.leagueYear);
  if (!row) return 0;
  let salary = row.salary + (row.excludedPerformanceBonus ?? 0);
  const yos = contract.yearsOfService;
  const isStandardFreeAgent =
    contract.signedAsFreeAgent &&
    !contract.deadMoney &&
    !contract.twoWay &&
    contract.signedUsing?.toLowerCase() !== "two-way";
  if (isStandardFreeAgent && yos != null && yos <= 1) {
    salary += Math.max(0, (c.minimumSalaries[2] ?? 0) - row.salary);
  }
  return salary;
}

/** Sum of player-contract Apron Team Salary before team-level adjustments. */
export function apronCommittedSalary(
  data: LeagueData,
  teamId: string,
  c: LeagueConstants,
): number {
  return data.contracts
    .filter((contract) => contract.teamId === teamId)
    .reduce((sum, contract) => sum + apronSalaryForYear(contract, c), 0);
}

/**
 * Art. VII §2(e)(1) Apron Team Salary. The engine can derive all contract-level
 * addbacks directly; app/data layers may pass team-level adjustments such as
 * free-agent amounts, unsigned first-round-pick charges, required tenders, or
 * incomplete-roster charges when those ledgers are available.
 */
export function apronTeamSalary(
  data: LeagueData,
  teamId: string,
  c: LeagueConstants,
  adjustments: ApronTeamSalaryAdjustments = {},
): number {
  return (
    apronCommittedSalary(data, teamId, c) +
    (adjustments.section4a1iiiAmounts ?? 0) -
    (adjustments.freeAgentAmounts ?? 0) +
    (adjustments.restrictedFreeAgentTenderAmounts ?? 0) -
    (adjustments.unsignedFirstRoundPickAmounts ?? 0) +
    (adjustments.requiredTenderAmounts ?? 0) -
    (adjustments.exceptionAmountsDeemedIncluded ?? 0) +
    (adjustments.section4lExcludedAmounts ?? 0) -
    (adjustments.incompleteRosterCharges ?? 0)
  );
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
  /** Art. VII §2(e) apron salary, which can differ from ordinary Team Salary. */
  apronSalary: number;
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
  apronAdjustments: ApronTeamSalaryAdjustments = {},
): CapSheet {
  const salary = teamSalary(data, teamId, c.leagueYear);
  const apronSalary = apronTeamSalary(data, teamId, c, apronAdjustments);
  return {
    teamId,
    leagueYear: c.leagueYear,
    salary,
    apronSalary,
    tier: classifyTier(apronSalary, c),
    capRoom: c.salaryCap - salary,
    spaceBelowTax: c.luxuryTaxLine - apronSalary,
    spaceBelowFirstApron: c.firstApron - apronSalary,
    spaceBelowSecondApron: c.secondApron - apronSalary,
    isOverCap: salary > c.salaryCap,
    isTaxpayer: apronSalary > c.luxuryTaxLine,
    isOverFirstApron: apronSalary > c.firstApron,
    isOverSecondApron: apronSalary > c.secondApron,
  };
}

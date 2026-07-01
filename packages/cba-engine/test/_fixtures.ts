import type { Contract, LeagueData, Team } from "../src/types";

/** Build a single-year, fully-guaranteed contract. */
export function contract(
  playerId: string,
  teamId: string,
  salary: number,
  leagueYear = "2025-26",
): Contract {
  return {
    playerId,
    playerName: playerId,
    teamId,
    years: [{ leagueYear, salary, guarantee: "full" }],
  };
}

/** A "filler" contract used to pin a team's base salary to a target. */
export function filler(teamId: string, salary: number, leagueYear = "2025-26"): Contract {
  return contract(`${teamId}_FILLER`, teamId, salary, leagueYear);
}

export function league(contracts: Contract[], leagueYear = "2025-26"): LeagueData {
  const ids = [...new Set(contracts.map((c) => c.teamId))];
  const teams: Team[] = ids.map((id) => ({ id, name: id }));
  return { leagueYear, teams, contracts };
}

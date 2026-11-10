import { salaryForYear, validateTrade } from "@apron/cba-engine";
import { BASE_CONTRACTS, C, SIM_DATE, TRADE_DEADLINE, YEAR, freeAgentsOf, holdsByTeam, leagueData, teamMeta } from "./league";
import { encodeTradeParam, summarizeTrade } from "./trade-share";

/*
 * A worked example for someone who has never used a trade machine: one real
 * trade the rules block today and allow at the deadline, with the provision
 * that decides it. It is FOUND in the current data, not written down, so it
 * can't go stale: when the player's freeze lifts, or he is traded, the search
 * lands on someone else, and when no such trade exists (after the deadline)
 * the page simply doesn't show one. Both verdicts come from the same
 * summarizeTrade() a shared link's preview uses, so the example and the board
 * it links to cannot disagree.
 */
export interface WorkedExample {
  /** The player whose freeze decides it, and who he is swapped for. */
  frozen: { name: string; team: string; teamName: string; salary: number };
  partner: { name: string; team: string; teamName: string; salary: number };
  /** The day his freeze lifts (ISO), between today and the deadline. */
  tradeableFrom: string;
  today: { reason: string; citation: string; href: string };
  deadline: { href: string };
}

let cached: WorkedExample | null | undefined;

export function deadlineExample(): WorkedExample | null {
  if (cached !== undefined) return cached;
  cached = find();
  return cached;
}

function find(): WorkedExample | null {
  if (SIM_DATE >= TRADE_DEADLINE) return null;
  const salary = (c: (typeof BASE_CONTRACTS)[number]) => salaryForYear(c, YEAR);
  const active = BASE_CONTRACTS.filter((c) => !c.deadMoney && !c.twoWay && salary(c) > 0);
  // Best-known first: the biggest contracts make the clearest example.
  const thawing = active
    .filter((c) => c.restriction && c.tradeableFrom && c.tradeableFrom > SIM_DATE && c.tradeableFrom <= TRADE_DEADLINE && !c.vetoReason)
    .sort((a, b) => salary(b) - salary(a));
  const data = leagueData(BASE_CONTRACTS);
  const capHolds = holdsByTeam(freeAgentsOf(BASE_CONTRACTS));
  for (const a of thawing.slice(0, 25)) {
    const sa = salary(a);
    const partners = active
      .filter((b) => b.teamId !== a.teamId && !b.restriction && !b.vetoReason && !b.noAggregate && Math.abs(salary(b) - sa) < sa * 0.1)
      .sort((x, y) => Math.abs(salary(x) - sa) - Math.abs(salary(y) - sa));
    for (const b of partners.slice(0, 10)) {
      const teams = [a.teamId, b.teamId];
      const players = [
        { playerId: a.playerId, from: a.teamId, to: b.teamId },
        { playerId: b.playerId, from: b.teamId, to: a.teamId },
      ];
      const atDeadline = encodeTradeParam(teams, players, [], [], "deadline");
      if (!summarizeTrade(atDeadline)?.legal) continue;
      const now = encodeTradeParam(teams, players);
      if (summarizeTrade(now)?.legal !== false) continue;
      // The freeze has to be the ONLY thing in the way today, so the example
      // teaches one rule.
      const violations = validateTrade(data, { teams, players, capHolds, date: SIM_DATE }, C).violations;
      if (violations.length !== 1 || violations[0]!.ruleId !== "trade_eligibility") continue;
      return {
        frozen: { name: a.playerName, team: a.teamId, teamName: teamMeta(a.teamId).name, salary: sa },
        partner: { name: b.playerName, team: b.teamId, teamName: teamMeta(b.teamId).name, salary: salary(b) },
        tradeableFrom: a.tradeableFrom!,
        today: { reason: violations[0]!.reason, citation: violations[0]!.citation ?? "", href: `/?t=${now}` },
        deadline: { href: `/?t=${atDeadline}` },
      };
    }
  }
  return null;
}

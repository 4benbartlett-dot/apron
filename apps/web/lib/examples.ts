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

/* ------------------------- one example per rule ------------------------- */
//
// The rules page shows, beside a rule, a real trade it blocks today. Same
// contract as the example above: each is searched for in the current data and
// must be blocked by that rule and nothing else, with the reason the board
// itself would print. No example found, none shown.

export interface RuleExample {
  /** "Player A (BOS) for Player B (UTA)". */
  label: string;
  reason: string;
  href: string;
}

type Leg = { playerId: string; from: string; to: string };
let ruleCache: Map<string, RuleExample> | undefined;

/** Examples keyed by provision id (lib/provisions.ts). */
export function ruleExamples(): Map<string, RuleExample> {
  if (ruleCache) return ruleCache;
  ruleCache = new Map();
  const salary = (c: (typeof BASE_CONTRACTS)[number]) => salaryForYear(c, YEAR);
  const data = leagueData(BASE_CONTRACTS);
  const capHolds = holdsByTeam(freeAgentsOf(BASE_CONTRACTS));
  const active = BASE_CONTRACTS.filter((c) => !c.deadMoney && !c.twoWay && salary(c) > 0);
  const free = active.filter((c) => !c.restriction && !c.vetoReason);
  const byTeam = new Map<string, typeof free>();
  for (const c of free) byTeam.set(c.teamId, [...(byTeam.get(c.teamId) ?? []), c]);
  for (const list of byTeam.values()) list.sort((a, b) => salary(b) - salary(a));
  const teams = [...byTeam.keys()].sort();
  const who = (c: (typeof free)[number]) => `${c.playerName} (${c.teamId})`;

  // Blocked by `ruleId` alone, and the board would say so in the same words.
  let budget = 6000;
  const only = (ruleId: string, legs: Leg[], label: string): RuleExample | null => {
    if (budget-- <= 0) return null;
    const pair = [...new Set(legs.flatMap((l) => [l.from, l.to]))];
    const v = validateTrade(data, { teams: pair, players: legs, capHolds, date: SIM_DATE }, C);
    if (v.legal || !v.violations.length || v.violations.some((x) => x.ruleId !== ruleId)) return null;
    const token = encodeTradeParam(pair, legs);
    const s = summarizeTrade(token);
    if (!s || s.legal || s.reason !== v.violations[0]!.reason) return null;
    return { label, reason: v.violations[0]!.reason, href: `/?t=${token}` };
  };

  // Salary matching: a team's highest-paid player for another's lowest-paid.
  matching: for (const x of teams) {
    const a = byTeam.get(x)!.find((c) => !c.noAggregate);
    if (!a) continue;
    for (const y of teams) {
      if (y === x) continue;
      const b = byTeam.get(y)!.at(-1);
      if (!b || salary(a) < salary(b) * 3) continue;
      const ex = only("salary_matching", [{ playerId: a.playerId, from: x, to: y }, { playerId: b.playerId, from: y, to: x }], `${who(a)} for ${who(b)}`);
      if (ex) {
        ruleCache.set("salary-matching", ex);
        break matching;
      }
    }
  }

  // The hard cap: a swap that matches, but leaves a team over the first apron.
  capped: for (const y of teams) {
    for (const b of byTeam.get(y)!.slice(0, 6)) {
      for (const x of teams) {
        if (x === y) continue;
        for (const a of byTeam.get(x)!.slice(0, 8)) {
          const sa = salary(a), sb = salary(b);
          if (sa <= sb * 1.05 || sa > sb * 1.25) continue;
          const ex = only("hard_cap_first_apron", [{ playerId: b.playerId, from: y, to: x }, { playerId: a.playerId, from: x, to: y }], `${who(a)} for ${who(b)}`);
          if (ex) {
            ruleCache.set("hard-cap", ex);
            break capped;
          }
        }
      }
    }
  }

  // Two months: a player just acquired, packaged with a teammate.
  const recent = free.filter((c) => c.noAggregate && c.aggregateFrom && c.aggregateFrom > SIM_DATE);
  packaged: for (const f of recent) {
    for (const t of byTeam.get(f.teamId)!.filter((c) => c.playerId !== f.playerId && !c.noAggregate)) {
      const sum = salary(f) + salary(t);
      for (const y of teams) {
        if (y === f.teamId) continue;
        for (const p of byTeam.get(y)!.filter((c) => Math.abs(salary(c) - sum) < sum * 0.08 && salary(c) > Math.max(salary(f), salary(t)) * 1.3)) {
          const ex = only(
            "no_aggregate",
            [{ playerId: f.playerId, from: f.teamId, to: y }, { playerId: t.playerId, from: t.teamId, to: y }, { playerId: p.playerId, from: y, to: f.teamId }],
            `${f.playerName} and ${t.playerName} (${f.teamId}) for ${who(p)}`,
          );
          if (ex) {
            ruleCache.set("two-month-aggregation", ex);
            break packaged;
          }
        }
      }
    }
  }
  return ruleCache;
}

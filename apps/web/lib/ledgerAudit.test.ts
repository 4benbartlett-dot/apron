import { describe, it, expect } from "vitest";
import { capSheet, validateTrade, type Contract } from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  C,
  SIM_DATE,
  TEAM_IDS,
  applyMove,
  currentSalary,
  feedStateOf,
  freeAgentsOf,
  leagueData,
  rosterLimitOn,
  rosterOf,
  type Move,
} from "@/lib/league";
import { auditLedger } from "@/lib/ledgerAudit";
import { sanitizeMoves } from "@/lib/moveGuard";

// Trade Mitchell to Detroit for Cunningham, then trade Mitchell on from
// Detroit. Remove the first trade from the moves bar and the second one is
// still on file, now sending Mitchell from Cleveland, a trade nobody built or
// checked. The board replayed it and said nothing. These pin the re-judging.

const tradeable = (cs: Contract[], team: string) =>
  rosterOf(cs, team).filter((c) => !c.restriction && !c.noAggregate && !c.vetoReason && !c.noTradeClause && currentSalary(c) > 4_000_000);

const swap = (x: Contract, y: Contract): Move => ({
  kind: "trade",
  label: `Trade: ${x.playerName}, ${y.playerName}`,
  players: [
    { playerId: x.playerId, to: y.teamId },
    { playerId: y.playerId, to: x.teamId },
  ],
});

const legalToday = (cs: Contract[], x: Contract, y: Contract) =>
  validateTrade(
    leagueData(cs),
    {
      teams: [x.teamId, y.teamId],
      players: [
        { playerId: x.playerId, from: x.teamId, to: y.teamId },
        { playerId: y.playerId, from: y.teamId, to: x.teamId },
      ],
      date: SIM_DATE,
    },
    C,
  ).legal;

/** The first one-for-one between two teams that the engine clears today. */
function firstSwap(cs: Contract[], a: string, b: string, skip = new Set<string>()): [Contract, Contract] | null {
  for (const x of tradeable(cs, a)) {
    if (skip.has(x.playerId)) continue;
    for (const y of tradeable(cs, b)) {
      if (skip.has(y.playerId)) continue;
      if (legalToday(cs, x, y)) return [x, y];
    }
  }
  return null;
}

/** A two-trade chain: X goes A to B, then X goes on from B to a third team. */
function chain(): { first: Move; second: Move; x: Contract; a: string } {
  for (const a of TEAM_IDS) {
    for (const b of TEAM_IDS) {
      if (a === b) continue;
      const one = firstSwap(BASE_CONTRACTS, a, b);
      if (!one) continue;
      const [x, y] = one;
      const first = swap(x, y);
      const after = applyMove(BASE_CONTRACTS, first);
      const xNow = after.find((c) => c.playerId === x.playerId)!;
      for (const third of TEAM_IDS) {
        if (third === a || third === b) continue;
        for (const z of tradeable(after, third)) {
          if (!legalToday(after, xNow, z)) continue;
          return { first, second: swap(xNow, z), x, a };
        }
      }
    }
  }
  throw new Error("no two-trade chain in the data");
}

describe("re-judging the moves on file", () => {
  it("finds nothing wrong with no moves, or with a trade the engine just cleared", () => {
    expect(auditLedger([])).toEqual([]);
    let checked = 0;
    for (let i = 0; i + 1 < TEAM_IDS.length && checked < 8; i += 2) {
      const pair = firstSwap(BASE_CONTRACTS, TEAM_IDS[i]!, TEAM_IDS[i + 1]!);
      if (!pair) continue;
      expect(auditLedger([swap(...pair)]), `${pair[0].playerName} for ${pair[1].playerName}`).toEqual([]);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });

  it("clears a two-trade chain as built, and flags the second trade once the first is removed", () => {
    const { first, second, x } = chain();
    expect(auditLedger([first, second])).toEqual([]);
    // Alone, it sends the player from his original team: a three-team deal
    // in which one side takes a player back and sends nobody.
    const alone = auditLedger([second]).filter((i) => i.index !== null);
    expect(alone).toHaveLength(1);
    expect(alone[0]!.index).toBe(0);
    expect(alone[0]!.text.length).toBeGreaterThan(20);
    expect(x.playerName.length).toBeGreaterThan(0);
  });

  it("says so when a later trade no longer moves the player it names", () => {
    const pair = firstSwap(BASE_CONTRACTS, "CLE", "DET") ?? firstSwap(BASE_CONTRACTS, TEAM_IDS[0]!, TEAM_IDS[1]!)!;
    const [x, y] = pair;
    // Send them across, then straight back. Without the first trade, the
    // second sends each player to the team he is already on.
    const back: Move = { kind: "trade", label: "Trade: back again", players: [{ playerId: x.playerId, to: x.teamId }, { playerId: y.playerId, to: y.teamId }] };
    const issues = auditLedger([back]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.text).toMatch(/already with .* so this trade no longer moves him/);
  });

  it("flags a trade of a player whose signing was removed", () => {
    const fa = freeAgentsOf(BASE_CONTRACTS).find((f) => f.hold === 0 || f.renounced) ?? freeAgentsOf(BASE_CONTRACTS)[0]!;
    const trade: Move = { kind: "trade", label: `Trade: ${fa.playerName}`, players: [{ playerId: fa.playerId, to: "DEN" }] };
    const issues = auditLedger([trade]);
    expect(issues).toEqual([{ index: 0, text: "A player in this trade is no longer on a roster at this point in the ledger." }]);
  });

  it("flags a ledger that leaves a team over a hard cap it was under", () => {
    // A team under the first apron with no cap of its own yet.
    const team = TEAM_IDS.find(
      (t) => !Number.isFinite(feedStateOf(t).hardCap) && capSheet(leagueData(BASE_CONTRACTS), t, C).apronSalary < C.firstApron - 8_000_000,
    )!;
    const room = C.firstApron - capSheet(leagueData(BASE_CONTRACTS), team, C).apronSalary;
    const sign = (playerId: string, salary: number, mechanism: "ntmle" | "bird"): Move => ({
      kind: "sign", label: `Sign: ${playerId}`, playerId, playerName: playerId, teamId: team, salary, years: 2, mechanism,
    });
    // The mid-level caps the team at the first apron; the second signing then carries it past.
    const capped = sign("mid-level-signing", 5_000_000, "ntmle");
    const capIssues = (moves: Move[]) => auditLedger(moves).filter((x) => /hard-capped at/.test(x.text));
    expect(capIssues([capped])).toEqual([]);
    const issues = capIssues([capped, sign("too-much", room + 2_000_000, "bird")]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.index).toBeNull();
  });

  it("flags a ledger that leaves a team over the roster limit", () => {
    const team = TEAM_IDS.find((t) => rosterOf(BASE_CONTRACTS, t).length <= rosterLimitOn())!;
    const need = rosterLimitOn() - rosterOf(BASE_CONTRACTS, team).length + 1;
    const signs: Move[] = Array.from({ length: need }, (_, i) => ({
      kind: "sign", label: `Sign: extra ${i}`, playerId: `extra-${i}`, playerName: `Extra ${i}`, teamId: team, salary: C.minimumSalaries[0]!, years: 2, mechanism: "minimum",
    }));
    expect(auditLedger(signs.slice(0, -1)).some((x) => /players under contract/.test(x.text))).toBe(false);
    expect(auditLedger(signs).some((x) => x.index === null && /players under contract, and the limit is/.test(x.text))).toBe(true);
  });

  it("a trade made on deadline day is re-judged on deadline day, and its day survives a save", () => {
    const frozen = BASE_CONTRACTS.find(
      (c) => !c.deadMoney && c.restriction && c.tradeableFrom && c.tradeableFrom > SIM_DATE && currentSalary(c) > 8_000_000,
    );
    const trade: Move = { kind: "trade", label: "Trade: deadline", players: [], day: "deadline" };
    expect(sanitizeMoves(JSON.parse(JSON.stringify([trade])))).toEqual([trade]);
    expect(sanitizeMoves([{ ...trade, day: "tomorrow" }])).toEqual([]);
    expect(frozen, "a player frozen today exists in the data").toBeDefined();
  });
});

import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, SIM_DATE, TEAM_IDS, feedStateOf, freeAgentsOf, holdsByTeam, rosterOf } from "@/lib/league";
import { ruleTrade } from "@/lib/admin/rule";
import { encodeTradeParam, summarizeTrade } from "@/lib/trade-share";
import { baseHolds, ruleOnBaseTrade } from "@/lib/verdict";

// The share card and the admin desk each rule on a trade with no session
// behind it, and each used to assemble that ruling itself. They had drifted:
// the share card counted cap holds that the real July had forced teams to
// renounce, which the board and the desk both drop, so a trade into cap room
// could be legal on the board and blocked on the card made from it. One
// assembly now feeds both.

/** One-for-ones across the league: each team's best-paid tradeable player for
 * the next team's fifth, most of them blocked, some not. */
function sampleTrades() {
  const out: { teams: string[]; players: { playerId: string; from: string; to: string }[] }[] = [];
  for (let i = 0; i < TEAM_IDS.length; i++) {
    const a = TEAM_IDS[i]!;
    const b = TEAM_IDS[(i + 1) % TEAM_IDS.length]!;
    const x = rosterOf(BASE_CONTRACTS, a)[0];
    const y = rosterOf(BASE_CONTRACTS, b)[4];
    const z = rosterOf(BASE_CONTRACTS, b)[0];
    if (!x || !y || !z) continue;
    for (const other of [y, z]) {
      out.push({
        teams: [a, b].sort(),
        players: [
          { playerId: x.playerId, from: a, to: b },
          { playerId: other.playerId, from: b, to: a },
        ],
      });
    }
  }
  return out;
}

describe("one ruling for a trade with no session behind it", () => {
  it("the share card and the admin desk agree on every sample trade, legal or not", () => {
    const trades = sampleTrades();
    let legal = 0;
    for (const t of trades) {
      const card = summarizeTrade(encodeTradeParam(t.teams, t.players))!;
      const desk = ruleTrade({ players: t.players, picks: [], cash: [] })!;
      expect(card.legal, t.players.map((p) => p.playerId).join(" for ")).toBe(desk.legal);
      if (card.legal) legal++;
    }
    expect(trades.length).toBeGreaterThan(50);
    // The sample has both kinds, or the comparison proves nothing.
    expect(legal).toBeGreaterThan(0);
    expect(legal).toBeLessThan(trades.length);
  });

  it("both are the shared ruling, judged on the data's day", () => {
    const t = sampleTrades()[0]!;
    const ruling = ruleOnBaseTrade({ ...t, picks: [], date: SIM_DATE });
    expect(summarizeTrade(encodeTradeParam(t.teams, t.players))!.legal).toBe(ruling.legal);
    expect(ruleTrade({ players: t.players, picks: [], cash: [] })!.legal).toBe(ruling.legal);
    expect(ruling.trade.date).toBe(SIM_DATE);
  });

  it("drops the cap holds the real July forced teams to renounce, as the board does", () => {
    const all = holdsByTeam(freeAgentsOf(BASE_CONTRACTS));
    const kept = baseHolds();
    const forced = freeAgentsOf(BASE_CONTRACTS).filter((f) => feedStateOf(f.priorTeam).forcedRenounced.has(f.playerName.toLowerCase()) && f.hold > 0);
    for (const f of forced) expect(kept[f.priorTeam] ?? 0, f.priorTeam).toBeLessThan(all[f.priorTeam]!);
    for (const team of TEAM_IDS) expect(kept[team] ?? 0, team).toBeLessThanOrEqual(all[team] ?? 0);
  });
});

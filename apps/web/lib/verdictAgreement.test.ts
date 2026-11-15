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

// A fan's Lakers trade on Nov 14, 2026 sent Milwaukee the Lakers' 2031 and
// 2032 seconds. Brooklyn holds the first and Oklahoma City the second. On the
// board a team is only offered picks it holds, so the question never came up
// there, and the ruling behind a link never asked it: the card said LEGAL.
describe("a pick has to be the sender's to send", () => {
  const rule = (picks: { id: string; from: string; to: string }[]) => {
    const teams = [...new Set(picks.flatMap((p) => [p.from, p.to]))].sort();
    return ruleOnBaseTrade({ teams, players: [], picks, date: SIM_DATE });
  };

  it("refuses a second another team already holds, and says who holds it", () => {
    const r = rule([
      { id: "LAL|2031|2", from: "LAL", to: "MIL" },
      { id: "LAL|2032|2", from: "LAL", to: "MIL" },
    ]);
    expect(r.legal).toBe(false);
    expect(r.unheldPicks.map((p) => p.text)).toEqual([
      "Los Angeles Lakers' 2031 second already belongs to Brooklyn Nets; Los Angeles Lakers can't trade it.",
      "Los Angeles Lakers' 2032 second already belongs to Oklahoma City Thunder; Los Angeles Lakers can't trade it.",
    ]);
  });

  it("the card for that link is blocked, with the reason, and the desk says the same", () => {
    const picks = [{ id: "LAL|2031|2", from: "LAL", to: "MIL" }];
    const card = summarizeTrade(encodeTradeParam(["LAL", "MIL"], [], picks))!;
    expect(card.legal).toBe(false);
    expect(card.reason).toMatch(/already belongs to Brooklyn Nets/);
    const desk = ruleTrade({ players: [], picks, cash: [] })!;
    expect(desk.legal).toBe(false);
    expect(desk.problems[0]).toMatch(/already belongs to Brooklyn Nets/);
  });

  it("refuses an own first that is owed, forfeited or frozen, each with its reason", () => {
    // Phoenix's 2027 first is Houston's outright; its 2029 goes to Houston or Brooklyn, depending on the order.
    expect(rule([{ id: "PHX|2027|1", from: "PHX", to: "CHA" }]).unheldPicks[0]!.text).toMatch(/already belongs to Houston Rockets/);
    expect(rule([{ id: "PHX|2029|1", from: "PHX", to: "CHA" }]).unheldPicks[0]!.text).toMatch(/is already owed to Houston or Brooklyn/);
    expect(rule([{ id: "LAC|2030|1", from: "LAC", to: "UTA" }]).unheldPicks[0]!.text).toMatch(/was forfeited to the league/);
    expect(rule([{ id: "BOS|2032|1", from: "BOS", to: "UTA" }]).unheldPicks[0]!.text).toMatch(/is frozen by a season over the second apron/);
  });

  it("lets a team send a pick it does hold: its own, or one it acquired", () => {
    expect(rule([{ id: "LAL|2033|2", from: "LAL", to: "MIL" }]).unheldPicks).toEqual([]);
    // Toronto's 2033 second is the Clippers' since the Leonard trade.
    expect(rule([{ id: "TOR|2033|2", from: "LAC", to: "UTA" }]).unheldPicks).toEqual([]);
    expect(rule([{ id: "TOR|2033|2", from: "TOR", to: "UTA" }]).unheldPicks).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import { salaryForYear } from "@apron/cba-engine";
import { BASE_CONTRACTS, SIM_DATE, TRADE_DEADLINE, YEAR } from "@/lib/league";
import { decodeTradeParam, encodeTradeParam, summarizeTrade, tradeDateOf, tradeHeadline } from "@/lib/trade-share";

// The board judges a staged trade today or at the deadline. The share token
// carried the trade and not the day, so a deal that is legal only at the
// deadline shared as BLOCKED: in the page title, in the unfurl image, and on
// the board of whoever opened the link.

const active = BASE_CONTRACTS.filter((c) => !c.deadMoney && !c.twoWay && salaryForYear(c, YEAR) > 0);
const swap = (a: (typeof active)[number], b: (typeof active)[number]) => ({
  teams: [a.teamId, b.teamId],
  players: [
    { playerId: a.playerId, from: a.teamId, to: b.teamId },
    { playerId: b.playerId, from: b.teamId, to: a.teamId },
  ],
});

/** A one-for-one swap that is legal at the deadline and involves a player
 * whose freeze lifts between today and then. Found, not named, so the test
 * outlives any one player's freeze; null once no such trade exists (after the
 * deadline). */
function deadlineOnlyTrade() {
  const thawing = active.filter((c) => c.restriction && c.tradeableFrom && c.tradeableFrom > SIM_DATE && c.tradeableFrom <= TRADE_DEADLINE);
  for (const a of thawing) {
    const sa = salaryForYear(a, YEAR);
    const partners = active.filter((b) => b.teamId !== a.teamId && !b.restriction && !b.vetoReason && Math.abs(salaryForYear(b, YEAR) - sa) < sa * 0.1);
    for (const b of partners.slice(0, 12)) {
      const t = swap(a, b);
      if (summarizeTrade(encodeTradeParam(t.teams, t.players, [], [], "deadline"))?.legal) return t;
    }
  }
  return null;
}

describe("a shared trade carries the day it was judged on", () => {
  const any = swap(active[0]!, active.find((c) => c.teamId !== active[0]!.teamId)!);

  it("round-trips the day, and a link with no day in it is a today link", () => {
    expect(decodeTradeParam(encodeTradeParam(any.teams, any.players, [], [], "deadline"))!.day).toBe("deadline");
    expect(decodeTradeParam(encodeTradeParam(any.teams, any.players))!.day).toBe("today");
    // A today link is byte-for-byte what it was before the token knew about days.
    expect(encodeTradeParam(any.teams, any.players, [], [], "today")).toBe(encodeTradeParam(any.teams, any.players));
    expect(tradeDateOf("today")).toBe(SIM_DATE);
    expect(tradeDateOf("deadline")).toBe(TRADE_DEADLINE);
  });

  const t = SIM_DATE < TRADE_DEADLINE ? deadlineOnlyTrade() : null;
  it.skipIf(!t)("a trade that works only at the deadline shares as legal at the deadline, blocked today", () => {
    const today = summarizeTrade(encodeTradeParam(t!.teams, t!.players))!;
    const deadline = summarizeTrade(encodeTradeParam(t!.teams, t!.players, [], [], "deadline"))!;
    expect(deadline.legal).toBe(true);
    expect(today.legal).toBe(false);
    expect(today.reason).toMatch(/cannot be traded/);
  });
});

// A three-team Warriors trade shared on Nov 14, 2026 previewed as "CHA get
// Porziņģis, Melton, 1st · ... · ORL get Moody, Santos, GSW". The line under
// the title shortened every item to its last word: right for a player, wrong
// for "GSW 2028 1st" and for a swap with Golden State.
describe("the line under a shared trade's title", () => {
  const token = encodeTradeParam(
    ["CHA", "GSW", "ORL"],
    [
      { playerId: "reidna01", from: "CHA", to: "GSW" },
      { playerId: "porzikr01", from: "GSW", to: "CHA" },
      { playerId: "moodymo01", from: "GSW", to: "ORL" },
    ],
    [{ id: "GSW|2028|1", from: "GSW", to: "CHA" }],
    [{ year: 2031, round: 1, favoredTo: "ORL", otherTeam: "GSW" }],
  );
  const s = summarizeTrade(token)!;
  const line = tradeHeadline(s);

  it("names a pick by whose it is and which draft, and a swap by who it is with", () => {
    expect(line).toContain("GSW 2028 1st");
    expect(line).toContain("’31 1st swap w/ GSW");
    expect(line).not.toMatch(/, 1st( ·|$)/);
    expect(line).not.toMatch(/, GSW( ·|$)/);
  });

  it("still calls a player by his last name, and lists each team once", () => {
    expect(line).toContain("CHA get Porziņģis, GSW 2028 1st");
    expect(line).toContain("GSW get Reid");
    expect(line).toContain("ORL get Moody, ’31 1st swap w/ GSW");
    expect(line.split(" · ")).toHaveLength(3);
  });

  it("the full names the card itself prints are untouched", () => {
    const cha = s.perTeam.find((p) => p.team === "CHA")!;
    expect(cha.incoming).toContain("Kristaps Porziņģis");
    expect(cha.incomingShort).toContain("Porziņģis");
  });
});

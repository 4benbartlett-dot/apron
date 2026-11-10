import { describe, it, expect } from "vitest";
import { salaryForYear } from "@apron/cba-engine";
import { BASE_CONTRACTS, SIM_DATE, TRADE_DEADLINE, YEAR } from "@/lib/league";
import { decodeTradeParam, encodeTradeParam, summarizeTrade, tradeDateOf } from "@/lib/trade-share";

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

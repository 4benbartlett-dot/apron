import { describe, it, expect } from "vitest";
import { validateTrade, tradeableOn } from "@apron/cba-engine";
import { BASE_CONTRACTS, C, JAN15_SHAPED, TRADE_DEADLINE, leagueData } from "@/lib/league";

const active = BASE_CONTRACTS.filter((c) => !c.deadMoney && !c.twoWay);
const named = (n: string) => {
  const c = active.find((x) => x.playerName === n);
  if (!c) throw new Error(`no ${n}`);
  return c;
};

describe("when each frozen player can be traded", () => {
  it("dates every freeze on the sheet but a 10-day contract", () => {
    const undated = active.filter((c) => c.restriction && !c.tradeableFrom && !/^10-day/.test(c.restriction));
    expect(undated.map((c) => `${c.teamId} ${c.playerName}: ${c.restriction}`)).toEqual([]);
    for (const c of active.filter((x) => x.tradeableFrom)) expect(c.restrictionCite, c.playerName).toMatch(/^2023 CBA Art\./);
  });

  it("a summer free agent waits for Dec. 15 (Art. VII §8(d)(ii))", () => {
    const n = active.filter((c) => c.tradeableFrom === "2026-12-15");
    expect(n.length).toBeGreaterThan(80);
    for (const c of n) expect(c.restrictionCite).toBe("2023 CBA Art. VII §8(d)(ii)");
  });

  it("a late signing waits three months instead: a Sep. 30 Exhibit 9, claimed off waivers, is Dec. 30", () => {
    // Bradley's contract is the one New York signed him to; Utah claimed it.
    expect(named("Tony Bradley").tradeableFrom).toBe("2026-12-30");
    expect(named("James Wiseman").tradeableFrom).toBe("2026-12-16");
  });

  it("the reported Bird re-signs wait for Jan. 15 (Art. VII §8(d)(iii))", () => {
    for (const n of ["Austin Reaves", "Coby White", "Tari Eason", "Jalen Duren", "Mark Williams"]) {
      expect(named(n).tradeableFrom, n).toBe("2027-01-15");
      expect(named(n).restrictionCite).toBe("2023 CBA Art. VII §8(d)(iii)");
    }
  });

  // The sheet can't see Bird rights, so a re-sign that LOOKS like §8(d)(iii)
  // is either on the reported list or named here with why it isn't. A new
  // one fails this test until someone checks it.
  const NOT_JAN15: Record<string, string> = {
    "Mohamed Diawara": "one season in the league: no Bird or Early Bird rights",
    "Kobe Sanders": "one season in the league: no Bird or Early Bird rights",
    "Javonte Green": "not on the reported list: re-signed without Bird or Early Bird rights",
    "Jock Landale": "not on the reported list: re-signed without Bird or Early Bird rights",
    "De'Anthony Melton": "not on the reported list: re-signed without Bird or Early Bird rights",
    "Precious Achiuwa": "not on the reported list: re-signed without Bird or Early Bird rights",
  };
  it("every re-sign shaped like the Jan. 15 rule is on the reported list or named", () => {
    const unexplained = [...JAN15_SHAPED].filter((n) => named(n).tradeableFrom !== "2027-01-15" && !NOT_JAN15[n]);
    expect(unexplained).toEqual([]);
  });

  it("a matched offer sheet holds a year, and never to the team that wrote it (Art. XI §5(j))", () => {
    const j = named("Spencer Jones");
    expect(j.restrictionCite).toBe("2023 CBA Art. XI §5(j)");
    expect(j.notTradeableTo).toBe("OKC");
    expect(tradeableOn(j, TRADE_DEADLINE)).toBe(false);
  });

  it("a rookie-scale extension carries no freeze; a veteran one past the limits carries six months", () => {
    expect(named("Pelle Larsson").restriction).toBeUndefined();
    expect(named("Payton Pritchard").tradeableFrom).toBe("2027-04-16");
    expect(named("Payton Pritchard").restrictionCite).toBe("2023 CBA Art. VII §8(f)(i)");
  });

  it("a player acquired by trade can't be combined with other salaries for two months", () => {
    expect(named("Kawhi Leonard").aggregateFrom).toBe("2026-11-14");
    expect(named("Buddy Hield").aggregateFrom).toBe("2026-11-27");
  });
});

describe("today versus the deadline", () => {
  const swap = (a: string, b: string, date: string) => {
    const x = named(a), y = named(b);
    return validateTrade(leagueData(BASE_CONTRACTS), { teams: [x.teamId, y.teamId], players: [{ playerId: x.playerId, from: x.teamId, to: y.teamId }, { playerId: y.playerId, from: y.teamId, to: x.teamId }], date }, C);
  };

  it("Reaves can't be dealt today, can at the deadline, and the verdict says why and when", () => {
    const today = swap("Austin Reaves", "Zach LaVine", "2026-11-02");
    const why = today.violations.find((v) => v.ruleId === "trade_eligibility")!;
    expect(why.reason).toContain("Jan. 15, 2027");
    expect(why.citation).toBe("2023 CBA Art. VII §8(d)(iii)");
    const deadline = swap("Austin Reaves", "Zach LaVine", TRADE_DEADLINE);
    expect(deadline.violations.map((v) => v.ruleId)).not.toContain("trade_eligibility");
  });

  it("by the deadline every summer free agent is eligible, and only the long freezes are left", () => {
    const left = active.filter((c) => c.restriction && !tradeableOn(c, TRADE_DEADLINE)).map((c) => c.playerName).sort();
    expect(left).toEqual(["Blake Wesley", "Moussa Cisse", "Payton Pritchard", "Saddiq Bey", "Spencer Jones", "Stephen Curry"].sort());
  });
});

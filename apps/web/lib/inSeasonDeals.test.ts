import { describe, it, expect } from "vitest";
import { salaryForYear, tradeableOn, validateTrade, leaguePhaseOn } from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  C,
  CALENDAR,
  IN_SEASON,
  SIM_DATE,
  SIM_PHASE,
  TRADE_DEADLINE,
  YEAR,
  applyMove,
  deadMoneyOf,
  leagueData,
  rosterLimitOn,
  rosterOf,
  tpeLedger,
  tradeTiming,
  type Move,
} from "@/lib/league";
import { sanitizeMoves } from "@/lib/moveGuard";

const dead = (team: string, name: string) => deadMoneyOf(BASE_CONTRACTS, team).find((c) => c.playerName === name);

/** `iso` plus `n` months, clamped to the month's last day: the test's own copy
 * of the CBA's "three (3) months following", so it checks the app's. */
function plusMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}
const later = (a: string, b: string) => (a > b ? a : b);

// The regular season makes contracts the offseason never did, each paid by the
// day. A waive ends the deal; it does not un-pay the days.
describe("contracts signed in season", () => {
  it("a waived rest-of-season minimum costs the days he was paid, to the dollar", () => {
    // Dalen Terry: two years, non-guaranteed (HoopsHype, Nov 4), 4 years of
    // service. Signed Nov 4, waived Nov 8, cleared waivers Nov 10: seven days
    // of $2,625,627 / 174. Spotrac's Thunder page carries $105,629 dead. The
    // sheet had him at $2,776,471 this season and $2,915,295 next, the last
    // contract on file for him, charged in full.
    const terry = dead("OKC", "Dalen Terry")!;
    expect(terry).toBeDefined();
    expect(salaryForYear(terry, YEAR)).toBe(Math.round((C.minimumSalaries[4]! * 7) / 174));
    expect(salaryForYear(terry, YEAR)).toBe(105_629);
    expect(salaryForYear(terry, "2027-28")).toBe(0);
    expect(rosterOf(BASE_CONTRACTS, "OKC").some((c) => c.playerName === "Dalen Terry")).toBe(false);
  });

  it("a 10-day that ran out stays on the books at all ten days", () => {
    const wesley = dead("LAC", "Blake Wesley")!;
    expect(wesley).toBeDefined();
    expect(salaryForYear(wesley, YEAR)).toBe(Math.round((C.minimumSalaries[2]! / 174) * 10));
  });
});

describe("the sim's day has a phase, and the rules that depend on it ask for it", () => {
  it("reads the phase off the one calendar", () => {
    expect(SIM_PHASE).toBe(leaguePhaseOn(SIM_DATE, CALENDAR));
    expect(IN_SEASON).toBe(SIM_DATE >= CALENDAR.openingNight && SIM_DATE <= CALENDAR.regularSeasonEnd);
    expect(TRADE_DEADLINE).toBe(CALENDAR.tradeDeadline);
    expect(tradeTiming("2026-08-01")).toBe("offseason");
    expect(tradeTiming("2026-11-09")).toBe("pre_dec15");
    expect(tradeTiming(TRADE_DEADLINE)).toBe("dec15_to_deadline");
    expect(tradeTiming("2027-03-01")).toBe("post_deadline");
  });

  it("carries fifteen standard contracts in season and twenty-one out of it", () => {
    expect(rosterLimitOn("2026-08-01")).toBe(21);
    expect(rosterLimitOn(CALENDAR.openingNight)).toBe(15);
    expect(rosterLimitOn("2027-04-11")).toBe(15);
    expect(rosterLimitOn("2027-04-12")).toBe(21);
  });

  it("an exception a board trade creates lasts a year from the trade, not until July 5", () => {
    const c = rosterOf(BASE_CONTRACTS, "OKC").filter((x) => !x.twoWay).sort((a, b) => salaryForYear(a, YEAR) - salaryForYear(b, YEAR))[0]!;
    const move: Move = { kind: "trade", label: "one player out, nothing back", players: [{ playerId: c.playerId, to: "UTA" }] };
    const minted = tpeLedger([move]).OKC!.find((s) => !s.preExisting)!;
    expect(minted.amount).toBe(salaryForYear(c, YEAR));
    expect(minted.expires).toBe(plusMonths(SIM_DATE, 12));
  });
});

// A session move used to write its freeze as bare text. `tradeableOn` reads an
// undated restriction as permanent, so a player signed on the board in
// November stayed frozen in deadline mode, three days after the CBA frees him.
describe("freezes a board move creates are dated like the feed's", () => {
  it("a free agent signed today waits for the later of Dec. 15 and three months", () => {
    const sign: Move = { kind: "sign", label: "Sign", playerId: "x-test-fa", playerName: "Test Free Agent", teamId: "UTA", salary: 2_625_627, mechanism: "minimum" };
    const c = applyMove(BASE_CONTRACTS, sign).find((x) => x.playerId === "x-test-fa")!;
    const from = later(CALENDAR.dec15, plusMonths(SIM_DATE, 3));
    expect(c.tradeableFrom).toBe(from);
    expect(c.restrictionCite).toBe("2023 CBA Art. VII §8(d)(ii)");
    expect(tradeableOn(c, SIM_DATE)).toBe(false);
    expect(tradeableOn(c, from)).toBe(true);
  });

  it("a player acquired in a board trade can be combined two months later", () => {
    const p = rosterOf(BASE_CONTRACTS, "OKC").find((x) => !x.twoWay)!;
    const c = applyMove(BASE_CONTRACTS, { kind: "trade", label: "t", players: [{ playerId: p.playerId, to: "UTA" }] }).find((x) => x.playerId === p.playerId)!;
    expect(c.teamId).toBe("UTA");
    expect(c.noAggregate).toBe(true);
    expect(c.aggregateFrom).toBe(plusMonths(SIM_DATE, 2));
  });

  it("a matched offer sheet keeps the sheet's 5% raises, and the player a veto, not a freeze", () => {
    const m: Move = { kind: "sign", label: "Matched", playerId: "x-test-rfa", playerName: "Test Restricted", teamId: "UTA", salary: 20_000_000, years: 3, mechanism: "bird", matchedSheetFrom: "BKN" };
    expect(sanitizeMoves([m])).toHaveLength(1);
    const c = applyMove(BASE_CONTRACTS, m).find((x) => x.playerId === "x-test-rfa")!;
    expect(c.years.map((y) => y.salary)).toEqual([20_000_000, 21_000_000, 22_000_000]);
    expect(c.notTradeableTo).toBe("BKN");
    expect(c.notTradeableToUntil).toBe(plusMonths(SIM_DATE, 12));
    expect(c.vetoReason).toContain("Art. XI §5(j)");
    // Tradeable, with his consent, on his free-agent date.
    expect(c.tradeableFrom).toBe(later(CALENDAR.dec15, plusMonths(SIM_DATE, 3)));
  });

  it("an old save's matched sheet still loads, with the same 5% and a year that ends", () => {
    const legacy = { kind: "sign", label: "Matched", playerId: "x-test-rfa", playerName: "Test Restricted", teamId: "UTA", salary: 20_000_000, years: 2, mechanism: "bird", restrictionText: "matched offer sheet (not trade-eligible for one year)" };
    const [m] = sanitizeMoves([legacy]);
    expect(m).toBeDefined();
    const c = applyMove(BASE_CONTRACTS, m!).find((x) => x.playerId === "x-test-rfa")!;
    expect(c.years.map((y) => y.salary)).toEqual([20_000_000, 21_000_000]);
    expect(c.restriction).toBe("matched offer sheet (not trade-eligible for one year)");
    expect(c.tradeableFrom).toBe(plusMonths(SIM_DATE, 12));
  });
});

// The share card and the hard-cap replay hand the engine a date and no timing
// bucket. The engine now reads the bucket off the date, so a trade judged at
// the deadline is judged by the deadline's rule on every surface.
describe("a trade's timing follows its date", () => {
  it("validateTrade gives the same verdict with a date as with the date's bucket", () => {
    const lg = leagueData(BASE_CONTRACTS);
    const cheapest = (team: string, n: number) =>
      rosterOf(BASE_CONTRACTS, team)
        .filter((c) => !c.twoWay && tradeableOn(c, TRADE_DEADLINE))
        .sort((a, b) => salaryForYear(a, YEAR) - salaryForYear(b, YEAR))
        .slice(0, n);
    const players = [
      ...cheapest("SAC", 3).map((c) => ({ playerId: c.playerId, from: "SAC", to: "UTA" })),
      ...cheapest("UTA", 1).map((c) => ({ playerId: c.playerId, from: "UTA", to: "SAC" })),
    ];
    const rules = (t: Parameters<typeof validateTrade>[1]) => validateTrade(lg, t, C).violations.map((v) => v.ruleId).sort();
    for (const date of ["2026-11-09", TRADE_DEADLINE]) {
      expect(rules({ teams: ["SAC", "UTA"], players, date }), date).toEqual(rules({ teams: ["SAC", "UTA"], players, date, timing: tradeTiming(date) }));
    }
  });
});

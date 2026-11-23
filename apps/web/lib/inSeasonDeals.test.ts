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
import { TRANSACTIONS } from "@apron/data";
import { buildTradeCard } from "@/lib/newsDay";

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

// The homepage replays real trades through the engine. When a team absorbs a
// player with no salary going back, the card names the exception it used, and
// where the ledger has recorded the use, that is the one it names.
describe("a real trade's card names the exception the team actually used", () => {
  it("Oklahoma City took Clifford into the Wiggins exception, not the larger Dort one", () => {
    const rows = TRANSACTIONS.filter((t) => t.player === "Nique Clifford" && t.type === "Trade" && t.date === "Nov 08, 2026");
    expect(rows.length).toBeGreaterThan(0);
    const card = buildTradeCard(rows, "2026-11-08")!;
    expect(card.legal).toBe(true);
    expect(card.docket!.find((d) => d.teamId === "OKC")!.tpeUse?.label).toBe("Aaron Wiggins TPE");
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

// Sacramento signed Mason Plumlee on Nov. 11 and Chicago signed Orlando
// Robinson on Nov. 13. Spotrac wrote both as "Signed a Rest-of-Season
// contract with ...", with no term in front. The parser wanted "2 year
// Rest-of-Season" and skipped them: Plumlee stayed a free agent with a hold
// on Oklahoma City, Robinson was nowhere, and both teams were a player short.
describe("a rest-of-season signing with no term on the row", () => {
  const signed = (name: string) => BASE_CONTRACTS.find((c) => c.playerName === name && !c.deadMoney);
  const thisYear = (name: string) => signed(name)?.years.find((y) => y.leagueYear === YEAR);

  it("is one season at the minimum, paid by the day: Plumlee's $2,139,724 is the reported figure", () => {
    const plumlee = signed("Mason Plumlee")!;
    expect(plumlee.teamId).toBe("SAC");
    expect(plumlee.paidDays).toBe(152);
    // One-year minimum for a veteran counts at the two-year figure (Art. VII
    // §3(f)), times 152 days left of 174 (Art. I §1(kk)(ii)).
    expect(thisYear("Mason Plumlee")).toMatchObject({ salary: 2_139_724, guarantee: "non_guaranteed" });
    expect(plumlee.years.filter((y) => y.leagueYear > YEAR)).toEqual([]);
  });

  // Robinson's row had no term either, and was first booked as one season at
  // the two-year veteran figure, $2,111,570. It is two seasons (Michael Scotto,
  // HoopsHype, Nov 18: two years, $5.25 million, a team option on the second),
  // and a minimum deal longer than one season counts at the player's own
  // scale: his four-year minimum of $2,625,627 times 150 days of 174 is the
  // $2,263,472 Hoops Rumors and Spotrac both print. The row is corrected in
  // feed-corrections.json. The second season is carried as not guaranteed,
  // which counts the same as the option it is.
  it("books Robinson in Chicago two days later: two seasons, at his own minimum", () => {
    const robinson = signed("Orlando Robinson")!;
    expect(robinson.teamId).toBe("CHI");
    expect(robinson.paidDays).toBe(150);
    expect(thisYear("Orlando Robinson")).toMatchObject({ salary: 2_263_472, guarantee: "non_guaranteed" });
    expect(thisYear("Orlando Robinson")!.salary).toBe(Math.round((C.minimumSalaries[4]! / 174) * 150));
    const later = robinson.years.filter((y) => y.leagueYear > YEAR);
    expect(later.map((y) => y.leagueYear)).toEqual(["2027-28"]);
    expect(Math.abs(later[0]!.salary - 2_988_178)).toBeLessThanOrEqual(1);
    expect(rosterOf(BASE_CONTRACTS, "CHI").some((c) => c.playerName === "Orlando Robinson")).toBe(true);
  });

  // Sacramento filled its last roster spot with Gabe Vincent on Nov. 23: one
  // season, not guaranteed (Michael Scotto, HoopsHype, Nov 23; the Kings
  // announced it the same day). The same arithmetic as Plumlee, twelve days
  // later: 140 days left of 174.
  it("books Vincent in Sacramento on Nov. 23: one season, 140 days of the minimum", () => {
    const vincent = signed("Gabe Vincent")!;
    expect(vincent.teamId).toBe("SAC");
    expect(vincent.paidDays).toBe(140);
    expect(thisYear("Gabe Vincent")).toMatchObject({ salary: 1_970_799, guarantee: "non_guaranteed" });
    // A seven-year veteran on a one-year minimum counts at the two-year figure (Art. VII §3(f)).
    expect(thisYear("Gabe Vincent")!.salary).toBe(Math.round((C.minimumSalaries[2]! / 174) * 140));
    expect(vincent.years.filter((y) => y.leagueYear > YEAR)).toEqual([]);
  });

  // Three months from the signing, and the deadline is Feb. 11. Plumlee,
  // signed Nov. 11, is free on deadline day. Robinson and Vincent are not
  // free until after it and cannot be traded this season.
  //
  // Robinson read Dec. 25 until Nov 23. He signed an Exhibit 10 with Chicago
  // on Sep. 25, the feed has no release between that and his Nov. 13 deal,
  // and the freeze was dated from the first signing with the team. It is
  // dated from the last: the contract he is on.
  it("each waits three months from the day he signed, which keeps two of them out of the deadline", () => {
    expect(signed("Mason Plumlee")!.tradeableFrom).toBe("2027-02-11");
    expect(signed("Orlando Robinson")!.tradeableFrom).toBe("2027-02-13");
    expect(signed("Gabe Vincent")!.tradeableFrom).toBe("2027-02-23");
    expect(signed("Mason Plumlee")!.tradeableFrom! <= TRADE_DEADLINE).toBe(true);
    for (const name of ["Orlando Robinson", "Gabe Vincent"]) expect(signed(name)!.tradeableFrom! > TRADE_DEADLINE, name).toBe(true);
    for (const name of ["Mason Plumlee", "Orlando Robinson", "Gabe Vincent"]) expect(signed(name)!.tradeableFrom! > SIM_DATE, name).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { validateTrade, tradeableOn } from "@apron/cba-engine";
import { BASE_CONTRACTS, C, JAN15_SHAPED, TRADE_DEADLINE, leagueData, currentSalary as currentSalaryOf } from "@/lib/league";

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

  // Hoops Rumors' "Players Who Can't Be Traded Until December 15" (updated
  // Oct 20, 2026), whole. Every name is Dec. 15 on the sheet unless named
  // below with the reason the two differ.
  const HR_DEC15 =
    "Jock Landale|Mike Conley|Ron Harper Jr.|Mitchell Robinson|Keon Ellis|Josh Minott|Day'Ron Sharpe|Moritz Wagner|Norman Powell|Thomas Bryant|James Harden|Mario Hezonja|Peyton Watson|Moussa Cisse|Marvin Bagley III|DeMar DeRozan|Alpha Diallo|Tyus Jones|John Collins|Kevin Huerter|Javonte Green|Charles Bassey|Draymond Green|Al Horford|De'Anthony Melton|Georges Niang|Gary Payton II|Brandon Williams|Bogdan Bogdanovic|Isaiah Crawford|Marcus Smart|Jae'Sean Tate|Larry Nance Jr.|Kelly Oubre Jr.|Bradley Beal|Rui Hachimura|Kobe Sanders|Quentin Grimes|Walker Kessler|Kevon Looney|Sandro Mamukelashvili|Collin Sexton|Matisse Thybulle|Ziaire Williams|Quinten Post|Simone Fontecchio|Tim Hardaway Jr.|Nick Richards|Klay Thompson|Ousmane Dieng|Pete Nance|Bones Hyland|Jonathan Kuminga|Trey Lyles|DeAndre Jordan|Bennedict Mathurin|Trendon Watford|Jose Alvarado|Jordan Clarkson|Mohamed Diawara|Andre Drummond|James Wiseman|Isaiah Hartenstein|Kenrich Williams|Jevon Carter|Jonathan Isaac|Nikola Vucevic|Kentavious Caldwell-Pope|Ariel Hukporti|LeBron James|Anfernee Simons|Dean Wade|Haywood Highsmith|Luke Kennard|Branden Carlson|Precious Achiuwa|Daeqwon Plowden|Ben Simmons|Harrison Barnes|Tobias Harris|Jordan McLaughlin|Kyle Anderson|Alijah Martin|Mo Bamba|Jaxson Hayes|Jusuf Nurkic|Josh Okogie|Anthony Gill|Khris Middleton|Trae Young".split("|");
  const HR_DEC15_DIFFERS: Record<string, string> = {
    "James Wiseman": "signed Sep. 16; three months is Dec. 16, by Hoops Rumors' own rule for signings after Sep. 15",
    "Anthony Gill": "signed Sep. 16; three months is Dec. 16, as above",
    "Pete Nance": "waived Oct. 17 and re-signed to a two-way Oct. 20; the list still has his old deal",
    "Haywood Highsmith": "waived Oct. 17 (Yardbarker, FantasyNerds); the list still has him",
  };
  it("matches Hoops Rumors' Dec. 15 list, name for name, except where named", () => {
    const sheet = (n: string) => active.find((c) => c.playerName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase());
    const off = HR_DEC15.filter((n) => !HR_DEC15_DIFFERS[n] && sheet(n)?.tradeableFrom !== "2026-12-15");
    expect(off.map((n) => `${n}: ${sheet(n)?.tradeableFrom ?? "not on the sheet"}`)).toEqual([]);
    // and the sheet has no Dec. 15 player the list doesn't
    const extra = active.filter((c) => c.tradeableFrom === "2026-12-15" && !HR_DEC15.some((n) => sheet(n) === c));
    expect(extra.map((c) => c.playerName)).toEqual([]);
  });

  it("a draft-rights player signing his first contract is a Draft Rookie: 30 days (Art. VII §8(d)(i))", () => {
    for (const n of ["Tarik Biberovic", "Khalifa Diop"]) {
      expect(named(n).restrictionCite, n).toBe("2023 CBA Art. VII §8(d)(i)");
      expect(tradeableOn(named(n), "2026-11-02"), n).toBe(true);
    }
    // a two-way converted to standard is a free agent, three months on
    expect(named("Jaden Bradley").tradeableFrom).toBe("2026-12-21");
  });

  it("a matched offer sheet is a veto for a year and a ban on the team that wrote it (Art. XI §5(j)), not a freeze", () => {
    const j = named("Spencer Jones");
    expect(j.tradeableFrom).toBe("2027-01-15"); // on Hoops Rumors' Jan. 15 list
    expect(j.notTradeableTo).toBe("OKC");
    expect(j.vetoReason).toMatch(/consent/);
    expect(named("Moussa Cisse").tradeableFrom).toBe("2026-12-15");
    expect(named("Moussa Cisse").notTradeableTo).toBe("NYK");
  });

  it("carries Hoops Rumors' 2026-27 veto list", () => {
    for (const n of ["Damian Lillard", "Bradley Beal", "Al Horford", "Jonathan Isaac", "Kenrich Williams", "Moussa Cisse"])
      expect(named(n).vetoReason, n).toBeTruthy();
    expect(named("Austin Reaves").vetoReason).toBeUndefined();
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

  // The three left at the deadline are the extensions past extend-and-trade
  // limits, each sourced: Pritchard (CelticsBlog: the freeze keeps him out of
  // the deadline), Bey (Hoops Rumors: six months), Curry (reported $55.7M then
  // $60.2M is an 8.1% raise, past the 5% an extend-and-trade allows). Brooks,
  // signed Aug 8, is free Feb 8, before it, as the Phoenix reporting says.
  it("by the deadline every summer free agent is eligible, and only the long freezes are left", () => {
    const left = active.filter((c) => c.restriction && !tradeableOn(c, TRADE_DEADLINE)).map((c) => c.playerName).sort();
    expect(left).toEqual(["Blake Wesley", "Payton Pritchard", "Saddiq Bey", "Stephen Curry"].sort());
    expect(tradeableOn(named("Dillon Brooks"), TRADE_DEADLINE)).toBe(true);
  });

  it("Spencer Jones can go anywhere at the deadline but Oklahoma City", () => {
    const j = named("Spencer Jones");
    const okc = active.find((c) => c.teamId === "OKC" && currentSalaryOf(c) > 10_000_000)!;
    const v = validateTrade(leagueData(BASE_CONTRACTS), { teams: ["DEN", "OKC"], players: [{ playerId: j.playerId, from: "DEN", to: "OKC" }, { playerId: okc.playerId, from: "OKC", to: "DEN" }], date: TRADE_DEADLINE }, C);
    expect(v.violations.find((x) => x.ruleId === "trade_eligibility")?.citation).toBe("2023 CBA Art. XI §5(j)");
  });
});

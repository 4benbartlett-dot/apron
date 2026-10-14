import { describe, it, expect } from "vitest";
import { validateTrade } from "../src/trade";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { SEASON_2026_27 } from "../src/constants/2026-27";
import { nextLeagueYear, postSeasonWindow } from "../src/constants/calendar";
import { league } from "./_fixtures";
import type { Contract, ContractYear, Trade } from "../src/types";

// Art. VII §2(e)(2)(ii). Portland's Jun 29, 2026 Morant trade used the expanded
// traded-player exception (row E) after the 2025-26 Regular Season, which binds
// Portland at the first apron through the end of 2026-27. Nothing in the engine
// knew that until Oct 14, 2026, when an outside fact-check caught it and the
// cap went into the data by hand. These tests keep the rule in the engine.

function twoYear(
  playerId: string,
  teamId: string,
  y1: number,
  y2: number,
  y2Guarantee: ContractYear["guarantee"] = "full",
): Contract {
  return {
    playerId,
    playerName: playerId,
    teamId,
    years: [
      { leagueYear: "2025-26", salary: y1, guarantee: "full" },
      { leagueYear: "2026-27", salary: y2, guarantee: y2Guarantee },
    ],
  };
}

/** Portland and Memphis with the three real contracts (filed salaries) and a
 * filler per team. `porNext` sets Portland's 2026-27 filler. */
function morantLeague(porNext = 150_000_000, extra: Contract[] = []) {
  return league([
    twoYear("POR_FILLER", "POR", 140_000_000, porNext),
    twoYear("grant", "POR", 32_000_001, 34_206_898),
    twoYear("murray", "POR", 3_132_000, 5_315_004),
    twoYear("MEM_FILLER", "MEM", 160_000_000, 160_000_000),
    twoYear("morant", "MEM", 39_446_090, 42_166_510),
    ...extra,
  ]);
}

const morantTrade = (date?: string): Trade => ({
  teams: ["POR", "MEM"],
  players: [
    { playerId: "morant", from: "MEM", to: "POR" },
    { playerId: "grant", from: "POR", to: "MEM" },
    { playerId: "murray", from: "POR", to: "MEM" },
  ],
  ...(date ? { date } : {}),
});

describe("season calendar", () => {
  it("knows when each Regular Season ends", () => {
    expect(C.calendar).toEqual({ regularSeasonEnd: "2026-04-12", capYearEnd: "2026-06-30" });
    expect(SEASON_2026_27.calendar).toEqual({ regularSeasonEnd: "2027-04-11", capYearEnd: "2027-06-30" });
  });

  it("names the Subsequent Salary Cap Year", () => {
    expect(nextLeagueYear("2025-26")).toBe("2026-27");
    expect(nextLeagueYear("2026-27")).toBe("2027-28");
    expect(nextLeagueYear("2099-00")).toBe("2100-01");
  });

  it("opens the window the day after the last day of the Regular Season and closes it June 30", () => {
    expect(postSeasonWindow("2026-04-12", C)).toBeNull(); // last day of the season
    expect(postSeasonWindow("2026-04-13", C)).toEqual({ subsequentYear: "2026-27" });
    expect(postSeasonWindow("2026-06-29", C)).toEqual({ subsequentYear: "2026-27" });
    expect(postSeasonWindow("2026-06-30", C)).toEqual({ subsequentYear: "2026-27" });
    expect(postSeasonWindow("2026-07-01", C)).toBeNull(); // next cap year
    expect(postSeasonWindow("2026-02-05", C)).toBeNull(); // deadline day
    expect(postSeasonWindow(undefined, C)).toBeNull();
    expect(postSeasonWindow("2026-06-29", { ...C, calendar: undefined })).toBeNull();
    expect(postSeasonWindow("2027-05-01", SEASON_2026_27)).toEqual({ subsequentYear: "2027-28" });
  });
});

describe("Art. VII §2(e)(2)(ii) — a row E–J trade after the Regular Season", () => {
  it("Portland's Jun 29 Morant trade hard-caps it at the first apron through 2026-27", () => {
    const v = validateTrade(morantLeague(), morantTrade("2026-06-29"), C);
    expect(v.legal).toBe(true);
    // $39,446,090 in for $35,132,001 out: past 100% + $250K, so expanded (row E).
    const rowE = v.hardCaps.find((h) => h.teamId === "POR" && h.row === "E");
    expect(rowE).toMatchObject({ level: "first_apron", leagueYears: ["2025-26", "2026-27"] });
    expect(rowE!.citation).toContain("§2(e)(2)(ii)(B)");
    // Grant and Murray are also aggregated (row H) — the looser second apron,
    // carried forward the same way.
    expect(v.hardCaps.find((h) => h.teamId === "POR" && h.row === "H")).toMatchObject({
      level: "second_apron",
      leagueYears: ["2025-26", "2026-27"],
    });
    // Memphis took back less and aggregated nothing: no cap.
    expect(v.hardCaps.filter((h) => h.teamId === "MEM")).toEqual([]);
    const test = v.checks.find((c) => c.ruleId === "subsequent_year_first_apron");
    expect(test).toMatchObject({ ok: true, teamId: "POR" });
    expect(test!.citation).toContain("§2(e)(2)(ii)(A)");
  });

  it("the same trade at the deadline binds only the year it's made in", () => {
    const v = validateTrade(morantLeague(), morantTrade("2026-02-05"), C);
    const rowE = v.hardCaps.find((h) => h.teamId === "POR" && h.row === "E");
    expect(rowE).toMatchObject({ level: "first_apron", leagueYears: ["2025-26"] });
    expect(rowE!.citation).not.toContain("§2(e)(2)(ii)");
    expect(v.checks.some((c) => c.ruleId.startsWith("subsequent_year_"))).toBe(false);
  });

  it("an undated trade runs no date-gated rule (the pre-calendar behavior)", () => {
    const v = validateTrade(morantLeague(), morantTrade(), C);
    expect(v.hardCaps.every((h) => h.leagueYears.length === 1)).toBe(true);
    expect(v.checks.some((c) => c.ruleId.startsWith("subsequent_year_"))).toBe(false);
  });

  it("(A) blocks a trade that leaves next year's Apron Team Salary over the apron — at THIS year's amount", () => {
    // Portland's 2026-27 sheet after the trade: $155M + $42,166,510 = $197.17M.
    // That is under 2026-27's real first apron ($209,015,000) but over
    // 2025-26's ($195,945,000), and §2(e)(3)(ii) tests at the latter.
    const v = validateTrade(morantLeague(155_000_000), morantTrade("2026-06-29"), C);
    expect(v.legal).toBe(false);
    const fail = v.violations.find((c) => c.ruleId === "subsequent_year_first_apron");
    expect(fail).toBeDefined();
    expect(fail!.teamId).toBe("POR");
    expect(fail!.reason).toContain("$195.94M"); // 2025-26's $195,945,000
    // The current-year test still passes: 2025-26 post-trade is $179.45M.
    expect(v.violations.filter((c) => c.ruleId !== "subsequent_year_first_apron")).toEqual([]);
    // Outside the window the same books are fine.
    expect(validateTrade(morantLeague(155_000_000), morantTrade("2026-03-01"), C).legal).toBe(true);
  });

  it("counts next year's option years as exercised (§2(e)(3)(i)(A))", () => {
    // $150M + $42.17M = $192.17M, plus a $4M team option for 2026-27 that
    // the CBA assumes is picked up: $196.17M, over $195,945,000.
    const option = twoYear("optionGuy", "POR", 1_500_000, 4_000_000, "team_option");
    const v = validateTrade(morantLeague(150_000_000, [option]), morantTrade("2026-06-29"), C);
    expect(v.violations.map((c) => c.ruleId)).toContain("subsequent_year_first_apron");
  });

  it("paying cash (row I) carries a second-apron cap; receiving it restricts nobody", () => {
    const data = league([
      twoYear("AAA_FILLER", "AAA", 170_000_000, 175_000_000),
      twoYear("BBB_FILLER", "BBB", 150_000_000, 150_000_000),
    ]);
    // Draft night: a pick bought for cash. No player contracts move.
    const v = validateTrade(
      data,
      { teams: ["AAA", "BBB"], players: [], cash: [{ from: "AAA", to: "BBB", amount: 1_000_000 }], date: "2026-06-24" },
      C,
    );
    expect(v.legal).toBe(true);
    expect(v.hardCaps).toEqual([
      expect.objectContaining({ teamId: "AAA", row: "I", level: "second_apron", leagueYears: ["2025-26", "2026-27"] }),
    ]);
    expect(v.checks.find((c) => c.ruleId === "subsequent_year_second_apron")).toMatchObject({ ok: true, teamId: "AAA" });
  });

  it("a cash payer over next year's second apron can't pay", () => {
    const data = league([
      twoYear("AAA_FILLER", "AAA", 170_000_000, 210_000_000), // over 2025-26's $207,824,000
      twoYear("BBB_FILLER", "BBB", 150_000_000, 150_000_000),
    ]);
    const v = validateTrade(
      data,
      { teams: ["AAA", "BBB"], players: [], cash: [{ from: "AAA", to: "BBB", amount: 1_000_000 }], date: "2026-06-24" },
      C,
    );
    expect(v.legal).toBe(false);
    expect(v.violations.map((c) => c.ruleId)).toEqual(["subsequent_year_second_apron"]);
  });

  it("a trade that engages no row E–J creates no cap, in the window or out", () => {
    // An even one-for-one swap: standard matching, no aggregation, no cash.
    const data = league([
      twoYear("AAA_FILLER", "AAA", 170_000_000, 200_000_000),
      twoYear("a1", "AAA", 10_000_000, 11_000_000),
      twoYear("BBB_FILLER", "BBB", 150_000_000, 150_000_000),
      twoYear("b1", "BBB", 10_000_000, 30_000_000),
    ]);
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "a1", from: "AAA", to: "BBB" },
          { playerId: "b1", from: "BBB", to: "AAA" },
        ],
        date: "2026-06-25",
      },
      C,
    );
    // AAA's 2026-27 book would be $230M — way over — but row E–J was never
    // engaged, so §2(e)(2)(ii) doesn't reach it.
    expect(v.legal).toBe(true);
    expect(v.hardCaps).toEqual([]);
    expect(v.checks.some((c) => c.ruleId.startsWith("subsequent_year_"))).toBe(false);
  });

  it("a row-F traded-player exception used after the season carries its first-apron cap", () => {
    const data = league([
      twoYear("AAA_FILLER", "AAA", 170_000_000, 170_000_000),
      twoYear("BBB_FILLER", "BBB", 150_000_000, 150_000_000),
      twoYear("b1", "BBB", 5_000_000, 5_200_000),
    ]);
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [{ playerId: "b1", from: "BBB", to: "AAA" }],
        tpeUse: { AAA: { amount: 5_000_000, preExisting: true, firstApronCap: true } },
        date: "2026-06-30",
      },
      C,
    );
    expect(v.legal).toBe(true);
    expect(v.hardCaps).toEqual([
      expect.objectContaining({ teamId: "AAA", row: "F", level: "first_apron", leagueYears: ["2025-26", "2026-27"] }),
    ]);
  });
});

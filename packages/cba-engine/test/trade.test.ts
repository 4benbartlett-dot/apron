import { describe, it, expect } from "vitest";
import { validateTrade } from "../src/trade";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";
import type { Trade } from "../src/types";

describe("validateTrade — the four correctness wins vs. ESPN/Spotrac machines", () => {
  it("LEGAL: two sub-apron teams using expanded matching", () => {
    const data = league([
      filler("AAA", 170_000_000),
      contract("pA", "AAA", 10_000_000), // AAA total 180M (over cap)
      filler("BBB", 153_000_000),
      contract("pB", "BBB", 17_000_000), // BBB total 170M (over cap)
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "pA", from: "AAA", to: "BBB" },
        { playerId: "pB", from: "BBB", to: "AAA" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(true);
    expect(v.violations).toHaveLength(0);
  });

  it("ILLEGAL: second-apron team aggregating two salaries for one bigger player", () => {
    const data = league([
      filler("SAS", 190_000_000),
      contract("s1", "SAS", 12_000_000),
      contract("s2", "SAS", 13_000_000), // SAS total 215M (second apron)
      filler("DAL", 151_000_000),
      contract("d1", "DAL", 24_000_000), // DAL total 175M (over cap)
    ]);
    const trade: Trade = {
      teams: ["SAS", "DAL"],
      players: [
        { playerId: "s1", from: "SAS", to: "DAL" },
        { playerId: "s2", from: "SAS", to: "DAL" },
        { playerId: "d1", from: "DAL", to: "SAS" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    expect(v.violations.map((x) => x.ruleId)).toContain(
      "second_apron_no_aggregation",
    );
  });

  it("ILLEGAL: first-apron team cannot take back more than 100%", () => {
    const data = league([
      filler("MIA", 177_000_000),
      contract("m1", "MIA", 20_000_000), // MIA total 197M (first apron)
      filler("ORL", 146_000_000),
      contract("o1", "ORL", 24_000_000), // ORL total 170M (over cap)
    ]);
    const trade: Trade = {
      teams: ["MIA", "ORL"],
      players: [
        { playerId: "m1", from: "MIA", to: "ORL" },
        { playerId: "o1", from: "ORL", to: "MIA" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    const miaMatch = v.violations.find(
      (x) => x.teamId === "MIA" && x.ruleId === "salary_matching",
    );
    expect(miaMatch).toBeDefined();
  });

  it("ILLEGAL: expanded matching that would vault a team over the first-apron hard cap", () => {
    const data = league([
      filler("DEN", 186_000_000),
      contract("dn1", "DEN", 8_000_000), // DEN total 194M (taxpayer, below first apron)
      filler("UTA", 145_000_000),
      contract("u1", "UTA", 15_000_000), // UTA total 160M (over cap)
    ]);
    const trade: Trade = {
      teams: ["DEN", "UTA"],
      players: [
        { playerId: "dn1", from: "DEN", to: "UTA" },
        { playerId: "u1", from: "UTA", to: "DEN" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    expect(v.violations.map((x) => x.ruleId)).toContain("hard_cap_first_apron");
  });

  it("LEGAL: second-apron team making a straight 1-for-1 swap (no aggregation)", () => {
    const data = league([
      filler("PHX", 195_000_000),
      contract("p1", "PHX", 20_000_000), // PHX total 215M (second apron)
      filler("LAC", 155_000_000),
      contract("l1", "LAC", 20_000_000), // LAC total 175M (over cap)
    ]);
    const trade: Trade = {
      teams: ["PHX", "LAC"],
      players: [
        { playerId: "p1", from: "PHX", to: "LAC" },
        { playerId: "l1", from: "LAC", to: "PHX" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(true);
    expect(v.violations).toHaveLength(0);
  });

  it("ILLEGAL: second-apron team sending out cash", () => {
    const data = league([
      filler("PHX", 195_000_000),
      contract("p1", "PHX", 20_000_000), // PHX total 215M (second apron)
      filler("LAC", 155_000_000),
      contract("l1", "LAC", 20_000_000),
    ]);
    const trade: Trade = {
      teams: ["PHX", "LAC"],
      players: [
        { playerId: "p1", from: "PHX", to: "LAC" },
        { playerId: "l1", from: "LAC", to: "PHX" },
      ],
      cash: [{ from: "PHX", to: "LAC", amount: 1_000_000 }],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    expect(v.violations.map((x) => x.ruleId)).toContain(
      "second_apron_no_cash_out",
    );
  });
});

// Art. VII §2(e)(2)(i)(A): the aggregation ban tests apron salary IMMEDIATELY
// FOLLOWING the trade — a team starting above the second apron may aggregate
// in a deal that itself sheds it to or below the line.
import { describe as d2, it as i2, expect as e2 } from "vitest";
import { validateTrade as vt2, type LeagueData as LD2, type Contract as C2 } from "../src";
import { SEASON_2026_27 as K2 } from "../src/constants";

const mk = (playerId: string, teamId: string, salary: number): C2 => ({
  playerId,
  playerName: playerId,
  teamId,
  years: [{ leagueYear: "2026-27", salary, guarantee: "full" }],
});

d2("second-apron aggregation: post-trade basis", () => {
  i2("a 2A team aggregating DOWN through the line is legal", () => {
    // ~$223M team (2A ≈ $221.7M) sends $12M + $12M for one $20M player:
    // post = $219M ≤ 2A → aggregation allowed per the CBA's post-trade test.
    const data: LD2 = {
      leagueYear: "2026-27",
      teams: [{ id: "AAA", name: "AAA" }, { id: "BBB", name: "BBB" }],
      contracts: [
        mk("a1", "AAA", 12_000_000),
        mk("a2", "AAA", 12_000_000),
        mk("a3", "AAA", 199_000_000),
        mk("b1", "BBB", 20_000_000),
        mk("b2", "BBB", 160_000_000),
      ],
    };
    const v = vt2(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "a1", from: "AAA", to: "BBB" },
          { playerId: "a2", from: "AAA", to: "BBB" },
          { playerId: "b1", from: "BBB", to: "AAA" },
        ],
      },
      K2,
    );
    e2(v.violations.map((x) => x.ruleId)).not.toContain("second_apron_no_aggregation");
  });
  i2("a 2A team aggregating while STAYING above the line is still blocked", () => {
    const data: LD2 = {
      leagueYear: "2026-27",
      teams: [{ id: "AAA", name: "AAA" }, { id: "BBB", name: "BBB" }],
      contracts: [
        mk("a1", "AAA", 12_000_000),
        mk("a2", "AAA", 12_000_000),
        mk("a3", "AAA", 215_000_000),
        mk("b1", "BBB", 23_000_000),
        mk("b2", "BBB", 160_000_000),
      ],
    };
    const v = vt2(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "a1", from: "AAA", to: "BBB" },
          { playerId: "a2", from: "AAA", to: "BBB" },
          { playerId: "b1", from: "BBB", to: "AAA" },
        ],
      },
      K2,
    );
    e2(v.violations.map((x) => x.ruleId)).toContain("second_apron_no_aggregation");
  });
});

describe("traded-player exceptions (v1: absorption + row F)", () => {
  // AAA over the cap (~$180M): takes back $18M for only $2M out. Matching
  // alone can't cover that; a $17M TPE absorbing the incoming player makes
  // the leg legal (the incoming still counts fully toward post salary).
  const data = () =>
    league([
      filler("AAA", 176_000_000),
      contract("small", "AAA", 2_000_000),
      filler("BBB", 160_000_000),
      contract("big", "BBB", 18_000_000),
    ]);
  const players = [
    { playerId: "small", from: "AAA", to: "BBB" },
    { playerId: "big", from: "BBB", to: "AAA" },
  ];

  it("absorbing into a TPE lifts the matching requirement for that salary", () => {
    const no = validateTrade(data(), { teams: ["AAA", "BBB"], players }, C);
    expect(no.legal).toBe(false);
    const yes = validateTrade(
      data(),
      {
        teams: ["AAA", "BBB"],
        players,
        tpeUse: { AAA: { amount: 18_000_000, preExisting: true, label: "test TPE" } },
      },
      C,
    );
    expect(yes.legal).toBe(true);
    expect(yes.teams.find((t) => t.teamId === "AAA")?.tpeAbsorbed).toBe(18_000_000);
    expect(yes.checks.some((ch) => ch.ruleId === "tpe_absorption" && ch.ok)).toBe(true);
    // Row F: pre-existing use is legal here (post ≈ $194M ≤ 1A) and noted.
    expect(yes.checks.some((ch) => ch.ruleId === "tpe_first_apron" && ch.ok)).toBe(true);
  });

  it("row F: a pre-existing TPE cannot lift a team past the first apron", () => {
    const hot = league([
      filler("AAA", 193_000_000),
      contract("small2", "AAA", 2_000_000),
      filler("BBB", 160_000_000),
      contract("big2", "BBB", 18_000_000),
    ]);
    const v = validateTrade(
      hot,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "small2", from: "AAA", to: "BBB" },
          { playerId: "big2", from: "BBB", to: "AAA" },
        ],
        // post = 195 - 2 + 18 = 211M > 1A (195,945,000... using 2025-26 C: 1A = 195,945,000)
        tpeUse: { AAA: { amount: 18_000_000, preExisting: true } },
      },
      C,
    );
    expect(v.legal).toBe(false);
    expect(v.violations.some((x) => x.ruleId === "tpe_first_apron")).toBe(true);
  });

  it("a SAME-offseason TPE has no first-apron gate (row F clause ii defers it)", () => {
    const hot = league([
      filler("AAA", 193_000_000),
      contract("small3", "AAA", 2_000_000),
      filler("BBB", 160_000_000),
      contract("big3", "BBB", 18_000_000),
    ]);
    const v = validateTrade(
      hot,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "small3", from: "AAA", to: "BBB" },
          { playerId: "big3", from: "BBB", to: "AAA" },
        ],
        tpeUse: { AAA: { amount: 18_000_000, preExisting: false } },
      },
      C,
    );
    expect(v.legal).toBe(true);
    expect(v.checks.some((ch) => ch.ruleId === "tpe_first_apron")).toBe(false);
  });
});

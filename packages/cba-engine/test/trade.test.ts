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

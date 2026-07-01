import { describe, it, expect } from "vitest";
import { validateTrade } from "../src/trade";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";
import type { Trade } from "../src/types";

// Fixes from the CBA stress-test audit.

describe("regression: a below-cap team may finish at most $250k over the cap", () => {
  const mk = (backSalary: number) =>
    league([
      filler("AAA", 129_000_000),
      contract("p1", "AAA", 1_000_000), // AAA total 130M, below the $154.647M cap
      filler("BBB", 140_000_000),
      contract("b1", "BBB", backSalary),
    ]);
  const trade: Trade = {
    teams: ["AAA", "BBB"],
    players: [
      { playerId: "p1", from: "AAA", to: "BBB" },
      { playerId: "b1", from: "BBB", to: "AAA" },
    ],
  };
  // room 24.647M + out 1M + 250k = 25.897M ceiling.
  it("ILLEGAL when AAA would finish more than $250k over the cap", () => {
    expect(validateTrade(mk(25_900_000), trade, C).legal).toBe(false);
  });
  it("LEGAL at $25.8M — over the old $100k ceiling but within the $250k allowance", () => {
    // 25.8M > old $100k ceiling (25.747M) but <= new $250k ceiling (25.897M).
    expect(validateTrade(mk(25_800_000), trade, C).legal).toBe(true);
  });
});

describe("regression: second-apron aggregation = no 1-for-1 assignment of incoming to distinct outgoing", () => {
  it("ILLEGAL: out 20+15 for in 18+16 — the $16M can't fit the leftover $15M", () => {
    const data = league([
      filler("AAA", 175_000_000),
      contract("a1", "AAA", 20_000_000),
      contract("a2", "AAA", 15_000_000), // AAA 210M > 2nd apron 207.824M
      filler("BBB", 150_000_000),
      contract("b1", "BBB", 18_000_000),
      contract("b2", "BBB", 16_000_000),
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "a1", from: "AAA", to: "BBB" },
        { playerId: "a2", from: "AAA", to: "BBB" },
        { playerId: "b1", from: "BBB", to: "AAA" },
        { playerId: "b2", from: "BBB", to: "AAA" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    expect(v.violations.map((x) => x.ruleId)).toContain("second_apron_no_aggregation");
  });

  it("LEGAL: 2-for-2 where each incoming fits a distinct outgoing (20+20 for 19+19)", () => {
    const data = league([
      filler("AAA", 175_000_000),
      contract("a1", "AAA", 20_000_000),
      contract("a2", "AAA", 20_000_000), // AAA 215M
      filler("BBB", 150_000_000),
      contract("b1", "BBB", 19_000_000),
      contract("b2", "BBB", 19_000_000),
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "a1", from: "AAA", to: "BBB" },
        { playerId: "a2", from: "AAA", to: "BBB" },
        { playerId: "b1", from: "BBB", to: "AAA" },
        { playerId: "b2", from: "BBB", to: "AAA" },
      ],
    };
    expect(validateTrade(data, trade, C).legal).toBe(true);
  });

  it("ILLEGAL: true aggregation — two $10M combined for one $18M", () => {
    const data = league([
      filler("AAA", 190_000_000),
      contract("a1", "AAA", 10_000_000),
      contract("a2", "AAA", 10_000_000), // AAA 210M
      filler("BBB", 150_000_000),
      contract("b1", "BBB", 18_000_000),
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "a1", from: "AAA", to: "BBB" },
        { playerId: "a2", from: "AAA", to: "BBB" },
        { playerId: "b1", from: "BBB", to: "AAA" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    expect(v.violations.map((x) => x.ruleId)).toContain("second_apron_no_aggregation");
  });
});

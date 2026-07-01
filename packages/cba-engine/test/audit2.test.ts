import { describe, it, expect } from "vitest";
import { validateTrade, spendingPower, classifyTier, capSheet } from "../src/index";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";
import type { Contract, Trade } from "../src/types";

// Round-2 audit fixes: aggregation is tested by whether salaries are actually
// COMBINED (bin-packing), not by raw outgoing count; and apron/tax tiers use
// strict "exceeds" boundaries.

describe("second-apron 'split': one outgoing absorbing several incoming is not aggregation", () => {
  it("LEGAL: out 25+5 for in 12+12 (the $25M covers both $12M)", () => {
    const data = league([
      filler("AAA", 180_000_000),
      contract("a1", "AAA", 25_000_000),
      contract("a2", "AAA", 5_000_000), // AAA 210M > 2nd apron 207.824M
      filler("BBB", 150_000_000),
      contract("b1", "BBB", 12_000_000),
      contract("b2", "BBB", 12_000_000),
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
    expect(v.legal).toBe(true);
  });
});

describe("recently-acquired (noAggregate) player: freeze blocks only real combination", () => {
  const frozen = (id: string, team: string, salary: number): Contract => {
    const c = contract(id, team, salary);
    c.noAggregate = true;
    return c;
  };

  it("LEGAL: frozen player + another sent to DIFFERENT teams, each matched 1-for-1", () => {
    const data = league([
      filler("BOS", 150_000_000),
      frozen("acq", "BOS", 15_000_000),
      contract("p2", "BOS", 12_000_000), // BOS 177M (over cap, under tax)
      filler("LAL", 160_000_000),
      contract("lal_in", "LAL", 15_000_000),
      filler("NYK", 160_000_000),
      contract("nyk_in", "NYK", 12_000_000),
    ]);
    const trade: Trade = {
      teams: ["BOS", "LAL", "NYK"],
      players: [
        { playerId: "acq", from: "BOS", to: "LAL" },
        { playerId: "p2", from: "BOS", to: "NYK" },
        { playerId: "lal_in", from: "LAL", to: "BOS" },
        { playerId: "nyk_in", from: "NYK", to: "BOS" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.violations.map((x) => x.ruleId)).not.toContain("no_aggregate");
    expect(v.legal).toBe(true);
  });

  it("ILLEGAL: frozen player genuinely combined with another to match one bigger incoming", () => {
    const data = league([
      filler("BOS", 150_000_000),
      frozen("acq", "BOS", 15_000_000),
      contract("x", "BOS", 10_000_000), // BOS 175M
      filler("LAL", 150_000_000),
      contract("z", "LAL", 22_000_000),
    ]);
    const trade: Trade = {
      teams: ["BOS", "LAL"],
      players: [
        { playerId: "acq", from: "BOS", to: "LAL" },
        { playerId: "x", from: "BOS", to: "LAL" },
        { playerId: "z", from: "LAL", to: "BOS" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    expect(v.violations.map((x) => x.ruleId)).toContain("no_aggregate");
  });
});

describe("exact-boundary tiers use strict 'exceeds'", () => {
  it("a team exactly at the second apron keeps the Taxpayer MLE", () => {
    const ids = spendingPower(C.secondApron, C).mechanisms.map((m) => m.id);
    expect(classifyTier(C.secondApron, C)).toBe("first_apron");
    expect(ids).toContain("tpmle");
  });

  it("capSheet tier and is* flags agree at every threshold boundary", () => {
    const at = (salary: number) =>
      capSheet(league([filler("BOS", salary)]), "BOS", C);
    const tax = at(C.luxuryTaxLine);
    expect(tax.isTaxpayer).toBe(false);
    expect(tax.tier).not.toBe("taxpayer");
    const a1 = at(C.firstApron);
    expect(a1.isOverFirstApron).toBe(false);
    expect(a1.tier).not.toBe("first_apron");
    const a2 = at(C.secondApron);
    expect(a2.isOverSecondApron).toBe(false);
    expect(a2.tier).not.toBe("second_apron");
  });
});

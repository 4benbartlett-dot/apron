import { describe, it, expect } from "vitest";
import { validateTrade, validateSignAndTrade } from "../src/index";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";
import type { Trade } from "../src/types";

describe("base-year compensation reduces the sending team's outgoing value", () => {
  it("BYC outgoing value = max(50% of current salary, prior salary)", () => {
    const byc = contract("byc", "AAA", 30_000_000); // current 30M
    byc.bycPriorSalary = 10_000_000; // -> outgoing value = max(15M, 10M) = 15M
    const data = league([
      filler("AAA", 150_000_000),
      byc,
      filler("BBB", 150_000_000),
      contract("b1", "BBB", 15_000_000),
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "byc", from: "AAA", to: "BBB" },
        { playerId: "b1", from: "BBB", to: "AAA" },
      ],
    };
    const aaa = validateTrade(data, trade, C).teams.find((t) => t.teamId === "AAA")!;
    expect(aaa.outgoingSalary).toBe(15_000_000); // BYC value, not $30M
  });
});

describe("sign-and-trade acquisition", () => {
  it("LEGAL below the first apron; hard-capped at the first apron", () => {
    const v = validateSignAndTrade(180_000_000, 10_000_000, C); // post $190M < 1A $195.945M
    expect(v.legal).toBe(true);
    expect(v.hardCap).toBe("first_apron");
  });
  it("ILLEGAL if it would push the acquirer over the first apron", () => {
    expect(validateSignAndTrade(190_000_000, 10_000_000, C).legal).toBe(false);
  });
  it("ILLEGAL for a team over the second apron", () => {
    const v = validateSignAndTrade(210_000_000, 5_000_000, C);
    expect(v.legal).toBe(false);
    expect(v.reason).toMatch(/second apron/i);
  });
});

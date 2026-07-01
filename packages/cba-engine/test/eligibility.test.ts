import { describe, it, expect } from "vitest";
import { validateTrade } from "../src/trade";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";
import type { Trade } from "../src/types";

describe("trade eligibility (offseason restrictions)", () => {
  it("ILLEGAL: trading a player who signed as a free agent this offseason", () => {
    const newGuy = contract("newguy", "BOS", 20_000_000);
    newGuy.restriction = "signed as a free agent this offseason (not trade-eligible until Dec 15)";
    const data = league([
      filler("BOS", 160_000_000),
      newGuy,
      filler("LAL", 160_000_000),
      contract("l1", "LAL", 20_000_000),
    ]);
    const trade: Trade = {
      teams: ["BOS", "LAL"],
      players: [
        { playerId: "newguy", from: "BOS", to: "LAL" },
        { playerId: "l1", from: "LAL", to: "BOS" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.legal).toBe(false);
    expect(v.violations.map((x) => x.ruleId)).toContain("trade_eligibility");
  });

  it("LEGAL: an extended player (no restriction) is immediately trade-eligible", () => {
    // Same as above but the player was extended, not signed as a FA.
    const extended = contract("ext", "BOS", 20_000_000); // no restriction flag
    const data = league([
      filler("BOS", 160_000_000),
      extended,
      filler("LAL", 160_000_000),
      contract("l1", "LAL", 20_000_000),
    ]);
    const trade: Trade = {
      teams: ["BOS", "LAL"],
      players: [
        { playerId: "ext", from: "BOS", to: "LAL" },
        { playerId: "l1", from: "LAL", to: "BOS" },
      ],
    };
    expect(validateTrade(data, trade, C).legal).toBe(true);
  });

  it("ILLEGAL: aggregating a player acquired this offseason", () => {
    const acq = contract("acq", "BOS", 15_000_000);
    acq.noAggregate = true;
    const data = league([
      filler("BOS", 150_000_000),
      acq,
      contract("p2", "BOS", 10_000_000),
      filler("LAL", 150_000_000),
      contract("star", "LAL", 24_000_000),
    ]);
    const trade: Trade = {
      teams: ["BOS", "LAL"],
      players: [
        { playerId: "acq", from: "BOS", to: "LAL" },
        { playerId: "p2", from: "BOS", to: "LAL" },
        { playerId: "star", from: "LAL", to: "BOS" },
      ],
    };
    const v = validateTrade(data, trade, C);
    expect(v.violations.map((x) => x.ruleId)).toContain("no_aggregate");
  });
});

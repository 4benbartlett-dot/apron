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

// The same freezes, dated: each lifts on a day, and the trade's own date
// decides which side of it the deal falls on.
describe("trade eligibility on a date", () => {
  const swap = (id: string, date?: string): Trade => ({
    teams: ["BOS", "LAL"],
    players: [
      { playerId: id, from: "BOS", to: "LAL" },
      { playerId: "l1", from: "LAL", to: "BOS" },
    ],
    date,
  });
  const signed = () => {
    const c = contract("fa", "BOS", 20_000_000);
    c.restriction = "signed as a free agent Jul. 7, 2026; tradeable Dec. 15, 2026";
    c.tradeableFrom = "2026-12-15";
    c.restrictionCite = "2023 CBA Art. VII §8(d)(ii)";
    return league([filler("BOS", 160_000_000), c, filler("LAL", 160_000_000), contract("l1", "LAL", 20_000_000)]);
  };

  it("blocks him the day before, cites the dated rule, and names the day", () => {
    const v = validateTrade(signed(), swap("fa", "2026-12-14"), C);
    const x = v.violations.find((y) => y.ruleId === "trade_eligibility")!;
    expect(x.citation).toBe("2023 CBA Art. VII §8(d)(ii)");
    expect(x.reason).toContain("Dec. 14, 2026");
  });

  it("lets him go on the day it lifts and after", () => {
    expect(validateTrade(signed(), swap("fa", "2026-12-15"), C).legal).toBe(true);
    expect(validateTrade(signed(), swap("fa", "2027-02-11"), C).legal).toBe(true);
  });

  it("holds an undated freeze, and any freeze when the trade has no date", () => {
    expect(validateTrade(signed(), swap("fa"), C).legal).toBe(false);
    const d = signed();
    d.contracts.find((c) => c.playerId === "fa")!.tradeableFrom = undefined;
    expect(validateTrade(d, swap("fa", "2027-02-11"), C).legal).toBe(false);
  });

  it("keeps a matched offer sheet away from the team that wrote it, even once he could go elsewhere", () => {
    const d = signed();
    const c = d.contracts.find((x) => x.playerId === "fa")!;
    c.restriction = "matched offer sheet";
    c.tradeableFrom = "2027-07-31";
    c.notTradeableTo = "LAL";
    const v = validateTrade(d, swap("fa", "2027-02-11"), C);
    expect(v.violations.filter((y) => y.ruleId === "trade_eligibility").length).toBe(2);
    expect(v.violations.some((y) => y.citation === "2023 CBA Art. XI §5(j)")).toBe(true);
  });

  it("lifts the two-month aggregation freeze on its date", () => {
    const acq = contract("acq", "BOS", 15_000_000);
    acq.noAggregate = true;
    acq.aggregateFrom = "2026-11-27";
    const data = league([
      filler("BOS", 150_000_000),
      acq,
      contract("p2", "BOS", 10_000_000),
      filler("LAL", 150_000_000),
      contract("star", "LAL", 24_000_000),
    ]);
    const t = (date: string): Trade => ({
      teams: ["BOS", "LAL"],
      players: [
        { playerId: "acq", from: "BOS", to: "LAL" },
        { playerId: "p2", from: "BOS", to: "LAL" },
        { playerId: "star", from: "LAL", to: "BOS" },
      ],
      date,
    });
    const before = validateTrade(data, t("2026-11-26"), C).violations.find((x) => x.ruleId === "no_aggregate");
    expect(before?.reason).toContain("Nov. 27, 2026");
    expect(validateTrade(data, t("2026-11-27"), C).violations.map((x) => x.ruleId)).not.toContain("no_aggregate");
  });
});

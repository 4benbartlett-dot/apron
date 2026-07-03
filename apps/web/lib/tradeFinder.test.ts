import { describe, it, expect } from "vitest";
import { findTradePackages } from "@/lib/tradeFinder";
import type { Contract, LeagueData } from "@apron/cba-engine";

const c = (playerId: string, teamId: string, salary: number): Contract => ({
  playerId,
  playerName: playerId,
  teamId,
  years: [{ leagueYear: "2026-27", salary, guarantee: "full" }],
});

const data: LeagueData = {
  leagueYear: "2026-27",
  teams: [
    { id: "AAA", name: "AAA" },
    { id: "BBB", name: "BBB" },
  ],
  contracts: [
    c("target", "BBB", 30_000_000),
    c("a1", "AAA", 28_000_000),
    c("a2", "AAA", 6_000_000),
    c("a3", "AAA", 2_500_000),
  ],
};

describe("findTradePackages", () => {
  it("returns legal packages ranked by two-way salary fit", () => {
    const pkgs = findTradePackages(data, "AAA", "target");
    expect(pkgs.length).toBeGreaterThan(0);
    // The tightest two-way salary match comes first.
    const fits = pkgs.map((p) => Math.abs(p.outSalary - p.inSalary));
    expect(fits).toEqual([...fits].sort((x, y) => x - y));
    for (const p of pkgs) {
      expect(Array.isArray(p.sweeteners)).toBe(true);
      // A package either sends salary in a sane band of what comes back, or
      // sends nothing at all (pure cap-room absorption — AAA is far under cap).
      if (p.players.length > 0) expect(p.outSalary).toBeGreaterThan(p.inSalary * 0.35);
    }
    // This far under the cap, absorbing the target with no outgoing salary
    // must be among the options (the old finder could never propose it).
    expect(pkgs.some((p) => p.players.length === 0)).toBe(true);
  });
  it("never proposes a package to the seller's own team", () => {
    expect(findTradePackages(data, "BBB", "target")).toEqual([]);
  });
});

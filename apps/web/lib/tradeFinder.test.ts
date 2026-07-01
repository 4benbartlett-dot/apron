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
  it("returns only legal packages, ranked by salary fit", () => {
    const pkgs = findTradePackages(data, "AAA", "target");
    expect(pkgs.length).toBeGreaterThan(0);
    // The tightest salary match comes first.
    const fits = pkgs.map((p) => Math.abs(p.outSalary - 30_000_000));
    expect(fits).toEqual([...fits].sort((x, y) => x - y));
    // Every returned package is in a sane matching band of the target.
    for (const p of pkgs) {
      expect(p.outSalary).toBeGreaterThan(30_000_000 * 0.5);
      expect(p.players.length).toBeGreaterThan(0);
    }
  });
  it("never proposes a package to the seller's own team", () => {
    expect(findTradePackages(data, "BBB", "target")).toEqual([]);
  });
});

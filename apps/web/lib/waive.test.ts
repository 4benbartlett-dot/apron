import { describe, it, expect } from "vitest";
import {
  BASE_CONTRACTS,
  applyMove,
  computeWaive,
  rosterOf,
  deadMoneyOf,
  currentSalary,
  leagueData,
  C,
  YEAR,
  type Move,
} from "@/lib/league";
import { teamSalary } from "@apron/cba-engine";
import type { Contract } from "@apron/cba-engine";

function contract(years: Contract["years"], over: Partial<Contract> = {}): Contract {
  return { playerId: "test01", playerName: "Test Player", teamId: "BOS", years, ...over };
}

describe("computeWaive — dead money + stretch (Art. VII §7)", () => {
  it("spreads a fully-guaranteed 2-year deal over 2N+1 = 5 years", () => {
    const w = computeWaive(
      contract([
        { leagueYear: "2026-27", salary: 20_000_000, guarantee: "full" },
        { leagueYear: "2027-28", salary: 20_000_000, guarantee: "full" },
      ]),
    );
    expect(w.guaranteedTotal).toBe(40_000_000);
    expect(w.remainingSeasons).toBe(2);
    expect(w.stretch.years).toBe(5);
    expect(w.stretch.perYear).toBeCloseTo(8_000_000, 0);
    expect(w.stretch.legal).toBe(8_000_000 <= C.salaryCap * 0.15);
  });

  it("counts only guaranteed money — non-guaranteed years wash out", () => {
    const w = computeWaive(
      contract([
        { leagueYear: "2026-27", salary: 5_000_000, guarantee: "full" },
        { leagueYear: "2027-28", salary: 6_000_000, guarantee: "non_guaranteed" },
      ]),
    );
    expect(w.guaranteedTotal).toBe(5_000_000);
    expect(w.straightYears).toHaveLength(1);
    // 1-year of guaranteed money left → stretch over 2*2+1 (seasons remaining
    // counts the deal length, not just the guaranteed rows) — but only $5M spreads.
    expect(w.stretch.perYear).toBeCloseTo(5_000_000 / w.stretch.years, 0);
  });

  it("a fully non-guaranteed contract has zero dead money", () => {
    const w = computeWaive(contract([{ leagueYear: "2026-27", salary: 2_000_000, guarantee: "non_guaranteed" }]));
    expect(w.guaranteedTotal).toBe(0);
    expect(w.straightYears).toHaveLength(0);
  });

  it("flags an illegal stretch when the per-year hit exceeds 15% of the cap", () => {
    // A huge one-year guarantee stretched over 3 years still clears >15% each.
    const big = C.salaryCap; // ~$154M → /3 ≈ $51M/yr, far over the 15% (~$23M) guard
    const w = computeWaive(contract([{ leagueYear: "2026-27", salary: big, guarantee: "full" }]));
    expect(w.stretch.legal).toBe(false);
  });
});

describe("waive move through applyMove", () => {
  // A fully-guaranteed Celtic with a real 2026-27 salary makes a stable anchor.
  const anchor = () =>
    BASE_CONTRACTS.find(
      (c) =>
        c.teamId === "BOS" &&
        !c.deadMoney &&
        currentSalary(c) > 0 &&
        c.years.some((y) => y.leagueYear === YEAR && y.guarantee === "full"),
    )!;
  const waive = (playerId: string, stretch = false): Move => ({ kind: "waive", label: "Waive", playerId, stretch });

  it("straight waive: player off the roster, dead money on the books, this-year cap unchanged", () => {
    const p = anchor();
    const before = teamSalary(leagueData(BASE_CONTRACTS), "BOS", YEAR);
    const out = applyMove(BASE_CONTRACTS, waive(p.playerId));
    const row = out.find((c) => c.playerId === p.playerId)!;

    expect(row.deadMoney).toBe(true);
    expect(rosterOf(out, "BOS").some((c) => c.playerId === p.playerId)).toBe(false);
    expect(deadMoneyOf(out, "BOS").some((c) => c.playerId === p.playerId)).toBe(true);
    // You still owe the guaranteed money this season — the charge just moves
    // from the roster to dead money, so 2026-27 team salary doesn't change.
    expect(teamSalary(leagueData(out), "BOS", YEAR)).toBeCloseTo(before, -3);
  });

  it("stretched waive: dead money spans 2N+1 years and this-year cap drops", () => {
    const p = anchor();
    const w = computeWaive(p);
    const before = teamSalary(leagueData(BASE_CONTRACTS), "BOS", YEAR);
    const out = applyMove(BASE_CONTRACTS, waive(p.playerId, true));
    const row = out.find((c) => c.playerId === p.playerId)!;

    expect(row.deadMoney).toBe(true);
    expect(row.years).toHaveLength(w.stretch.years);
    // Total dead money is preserved (within per-year rounding).
    const total = row.years.reduce((s, y) => s + y.salary, 0);
    expect(Math.abs(total - w.guaranteedTotal)).toBeLessThan(w.stretch.years + 1);
    // Spreading the money lowers the near-term cap hit.
    expect(teamSalary(leagueData(out), "BOS", YEAR)).toBeLessThan(before);
  });
});

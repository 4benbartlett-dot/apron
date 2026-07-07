import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, impactScoreOf, positionOf, impactComponents } from "@/lib/league";

// Player value = the HYBRID impact metric (best_metric_2026_leaderboard.csv),
// scaled so the league's best reads 100 and net-negative players go below 0.

const named = (n: string) => BASE_CONTRACTS.find((c) => c.playerName === n && !c.deadMoney)!;

describe("impact scale (from the HYBRID leaderboard)", () => {
  it("Jokić is the 100 anchor and the ladder ranks correctly", () => {
    expect(impactScoreOf(named("Nikola Jokić"))).toBe(100);
    const sga = impactScoreOf(named("Shai Gilgeous-Alexander"));
    const wemby = impactScoreOf(named("Victor Wembanyama"));
    const curry = impactScoreOf(named("Stephen Curry"));
    expect(sga).toBeGreaterThan(80);
    expect(sga).toBeLessThan(100);
    expect(wemby).toBeGreaterThan(80);
    expect(curry).toBeGreaterThan(30);
    expect(curry).toBeLessThan(wemby);
  });

  it("net-negative players go below zero, floored at -40", () => {
    const all = BASE_CONTRACTS.filter((c) => !c.deadMoney).map((c) => impactScoreOf(c));
    expect(Math.max(...all)).toBe(100);
    expect(all.some((v) => v < 0)).toBe(true);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(-40);
  });

  it("small-sample fallbacks are minutes-regularized (Ty Jerome < Curry)", () => {
    // Ty Jerome: +7.7 BPM in 339 minutes — not a star. The BPM fallback must
    // shrink toward replacement so he doesn't outrank actual stars.
    const tj = named("Ty Jerome");
    expect(impactScoreOf(tj)).toBeLessThan(impactScoreOf(named("Stephen Curry")));
    expect(impactScoreOf(tj)).toBeLessThan(impactScoreOf(named("Jimmy Butler")));
    expect(impactScoreOf(tj)).toBeLessThan(25);
  });

  it("every rostered player gets a number, even without a CSV row", () => {
    for (const c of BASE_CONTRACTS) {
      if (c.deadMoney) continue;
      expect(Number.isFinite(impactScoreOf(c))).toBe(true);
    }
  });
});

describe("provenance & coverage (audit-bundle model)", () => {
  it("stars carry the exact box+RAPM hybrid with RAPMp provenance", () => {
    const jokic = named("Nikola Jokić");
    const comp = impactComponents(jokic);
    expect(comp.source).toBe("hybrid");
    expect(comp.rapmp).toBeGreaterThan(5);
    expect(comp.bpm).toBeGreaterThan(10);
  });

  it("most rostered players use a real model value, not a raw projection", () => {
    const active = BASE_CONTRACTS.filter(
      (c) => !c.deadMoney && c.years.some((y) => y.leagueYear === "2026-27" && y.salary > 0),
    );
    const real = active.filter((c) => impactComponents(c).source !== "projected");
    expect(real.length / active.length).toBeGreaterThan(0.8);
  });
});

describe("positions", () => {
  it("known players carry the right primary position", () => {
    expect(positionOf(named("Nikola Jokić").playerId)).toBe("C");
    expect(positionOf(named("Shai Gilgeous-Alexander").playerId)).toBe("PG");
    expect(positionOf(named("Victor Wembanyama").playerId)).toBe("C");
  });

  it("nearly every active player has a position (>95% coverage)", () => {
    const active = BASE_CONTRACTS.filter(
      (c) => !c.deadMoney && c.years.some((y) => y.leagueYear === "2026-27" && y.salary > 0),
    );
    const withPos = active.filter((c) => positionOf(c.playerId));
    expect(withPos.length / active.length).toBeGreaterThan(0.95);
    for (const c of withPos) expect(["PG", "SG", "SF", "PF", "C"]).toContain(positionOf(c.playerId));
  });
});

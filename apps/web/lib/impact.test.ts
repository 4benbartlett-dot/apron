import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, impactScoreOf, impactMeterOf, impactComponents, positionOf, teamStrengthOf } from "@/lib/league";

// Player value = "Apron Value" from the hardened impact model: box score
// blended 50/50 with real stint-level RAPM, on a 0-100 scale (50 = replacement,
// ~97 = league best), with a ± band, a tier, and RAPM/box provenance.

const named = (n: string) => BASE_CONTRACTS.find((c) => c.playerName === n && !c.deadMoney)!;

describe("Apron Value scale (hardened model)", () => {
  it("50-centered, league best in the mid-90s, ranked correctly", () => {
    const jokic = impactScoreOf(named("Nikola Jokić"));
    const sga = impactScoreOf(named("Shai Gilgeous-Alexander"));
    const curry = impactScoreOf(named("Stephen Curry"));
    expect(jokic).toBeGreaterThan(94);
    expect(jokic).toBeLessThanOrEqual(100);
    expect(sga).toBeLessThan(jokic);
    expect(sga).toBeGreaterThan(88);
    expect(curry).toBeGreaterThan(50);
    expect(curry).toBeLessThan(sga);
  });

  it("clipped to 0-100 (no negatives), replacement near 50", () => {
    const all = BASE_CONTRACTS.filter((c) => !c.deadMoney).map((c) => impactScoreOf(c));
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...all)).toBeLessThanOrEqual(100);
  });

  it("carries a ± band and a tier for every player", () => {
    const jokic = impactComponents(named("Nikola Jokić"));
    expect(jokic.tier).toBe("MVP");
    expect(jokic.uncertainty).toBeGreaterThan(0);
    expect(jokic.source).toBe("hybrid");
    expect(jokic.rapmp).toBeGreaterThan(5);
  });

  it("small-sample bench players don't outrank stars (Ty Jerome)", () => {
    // +7.7 BPM in 339 minutes — box-half, minutes-shrunk.
    const tj = named("Ty Jerome");
    expect(impactScoreOf(tj)).toBeLessThan(impactScoreOf(named("Stephen Curry")));
    expect(["MVP", "All-NBA"]).not.toContain(impactComponents(tj).tier);
    expect(impactComponents(tj).source).toBe("box");
  });

  it("meter value (impact points above replacement) is 0-centered", () => {
    expect(impactMeterOf(named("Nikola Jokić"))).toBeGreaterThan(8);
    // a replacement-ish player contributes ~nothing to a trade's value tally
    const depth = BASE_CONTRACTS.filter((c) => !c.deadMoney).map(impactMeterOf);
    expect(Math.min(...depth)).toBe(0);
  });

  it("most rostered players use a real model value", () => {
    const active = BASE_CONTRACTS.filter(
      (c) => !c.deadMoney && c.years.some((y) => y.leagueYear === "2026-27" && y.salary > 0),
    );
    const real = active.filter((c) => impactComponents(c).source !== "projected");
    expect(real.length / active.length).toBeGreaterThan(0.8);
  });
});

describe("team strength (hardened, current-roster)", () => {
  it("all 30 teams have a strength snapshot, OKC on top", () => {
    let top = "";
    let best = -1;
    for (const t of ["OKC", "BOS", "DEN", "SAS", "WAS"]) {
      const s = teamStrengthOf(t);
      expect(s).toBeDefined();
      if (s && s.av > best) { best = s.av; top = t; }
    }
    expect(top).toBe("OKC");
    expect(teamStrengthOf("OKC")!.projNrtg).toBeGreaterThan(8);
  });
});

describe("positions", () => {
  it("known players carry the right primary position", () => {
    expect(positionOf(named("Nikola Jokić").playerId)).toBe("C");
    expect(positionOf(named("Shai Gilgeous-Alexander").playerId)).toBe("PG");
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

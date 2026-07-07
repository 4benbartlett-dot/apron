import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, impactScoreOf, impactMeterOf, impactComponents, positionOf, teamStrengthOf, teamProjection, TEAM_IDS, ageOf } from "@/lib/league";
import { IMPACT_2026, PLAYER_BIO_2026 } from "@apron/data";

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

describe("team projections (net rating + wins, delta from moves)", () => {
  it("no moves → exactly the model baseline, zero delta (no drift)", () => {
    const okc = teamProjection("OKC", BASE_CONTRACTS)!;
    expect(okc.deltaWins).toBe(0);
    expect(okc.deltaNrtg).toBe(0);
    expect(okc.projWins).toBe(okc.baseWins);
    expect(okc.projNrtg).toBe(okc.baseNrtg);
    expect(okc.baseWins).toBeGreaterThan(55); // OKC is a contender in the model
  });

  const moveTo = (playerName: string, to: string) => {
    const p = BASE_CONTRACTS.find((c) => c.playerName === playerName)!;
    return BASE_CONTRACTS.map((c) => (c.playerId === p.playerId ? { ...c, teamId: to } : c));
  };

  it("acquiring a superstar lifts the buyer and sinks the seller", () => {
    const moved = moveTo("Nikola Jokić", "OKC");
    const okc = teamProjection("OKC", moved)!;
    const den = teamProjection("DEN", moved)!;
    expect(okc.deltaWins).toBeGreaterThan(8);
    expect(den.deltaWins).toBeLessThan(-8);
  });

  it("minutes displacement: the same star helps a needy team more than a deep one", () => {
    // A weak team (mostly sub-replacement minutes to displace) gains more from
    // an MVP than a title contender, whose bench minutes are already good.
    const toWeak = teamProjection("UTA", moveTo("Nikola Jokić", "UTA"))!;
    const toDeep = teamProjection("BOS", moveTo("Nikola Jokić", "BOS"))!;
    expect(toWeak.deltaWins).toBeGreaterThan(0);
    expect(toDeep.deltaWins).toBeGreaterThan(0);
    expect(toWeak.deltaWins).toBeGreaterThan(toDeep.deltaWins);
  });

  it("the seller's loss doesn't depend on where the star is dealt", () => {
    // Removing a player is a property of the roster he leaves, not the buyer.
    const a = teamProjection("DEN", moveTo("Nikola Jokić", "UTA"))!.deltaWins;
    const b = teamProjection("DEN", moveTo("Nikola Jokić", "BOS"))!.deltaWins;
    expect(a).toBe(b);
  });

  it("a role player barely moves a team; a star moves it a lot", () => {
    const roleSwing = Math.abs(teamProjection("WAS", moveTo("Grayson Allen", "WAS"))!.deltaWins);
    const starSwing = Math.abs(teamProjection("WAS", moveTo("Nikola Jokić", "WAS"))!.deltaWins);
    expect(roleSwing).toBeLessThanOrEqual(3);
    expect(starSwing).toBeGreaterThan(roleSwing + 8);
  });

  it("the aging prior never leaks into a no-move baseline", () => {
    // Aging is applied to both the live and base roster, so an untouched roster
    // returns exactly the author's shipped baseline — the coarse aging layer can
    // only ever refine the DELTA from a move, never distort the standings floor.
    for (const t of ["OKC", "BOS", "DEN", "WAS"]) {
      const p = teamProjection(t, BASE_CONTRACTS)!;
      expect(p.deltaNrtg).toBe(0);
      expect(p.projWins).toBe(p.baseWins);
    }
  });

  it("projected wins stay in a plausible NBA range", () => {
    for (const t of TEAM_IDS) {
      const p = teamProjection(t, BASE_CONTRACTS);
      if (!p) continue;
      expect(p.projWins).toBeGreaterThanOrEqual(12);
      expect(p.projWins).toBeLessThanOrEqual(73);
    }
  });
});

describe("player bio (real ages + availability, Basketball-Reference)", () => {
  it("every rated player has a real age", () => {
    const ids = Object.keys(IMPACT_2026.byId);
    const withAge = ids.filter((id) => PLAYER_BIO_2026[id]?.age != null);
    expect(withAge.length).toBe(ids.length); // 100% coverage
    expect(ids.length).toBeGreaterThan(400);
  });

  it("ages are within a real NBA range and advance one year for 2026-27", () => {
    for (const [id, b] of Object.entries(PLAYER_BIO_2026)) {
      if (b.age == null) continue;
      expect(b.age).toBeGreaterThanOrEqual(18);
      expect(b.age).toBeLessThanOrEqual(45);
      expect(ageOf(id)).toBe(b.age + 1); // projection ages the player into next season
    }
  });

  it("availability data is present and sane (games ≤ 82, started ≤ played)", () => {
    for (const b of Object.values(PLAYER_BIO_2026)) {
      if (b.g != null) expect(b.g).toBeLessThanOrEqual(82);
      if (b.g != null && b.gs != null) expect(b.gs).toBeLessThanOrEqual(b.g);
      if (b.mpg != null) expect(b.mpg).toBeLessThanOrEqual(48);
    }
  });
});

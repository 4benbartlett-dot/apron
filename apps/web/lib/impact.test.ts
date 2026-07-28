import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, impactScoreOf, impactMeterOf, impactComponents, positionOf, teamStrengthOf, teamProjection, TEAM_IDS, ageOf, allocateRotation, eligiblePositions, secondaryPositionsOf, teamFit, teamDimensions, playerDims, injuryOf, currentSalary, adjustedAv } from "@/lib/league";
import { IMPACT_2026, PLAYER_BIO_2026, SECONDARY_POSITIONS_2026, PLAYER_DIMENSIONS_2026, PLAYER_INJURIES_2026, PLAYER_PEDIGREE_2026 } from "@apron/data";

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
    expect(sga).toBeGreaterThan(88);
    expect(sga).toBeLessThanOrEqual(jokic); // two MVP-caliber stars can both cap at 100
    expect(curry).toBeGreaterThan(50);
    expect(curry).toBeLessThan(sga); // Curry (~79) is a clear star, below the very top
  });

  it("clipped to 0-100 (no negatives), replacement near 50", () => {
    const all = BASE_CONTRACTS.filter((c) => !c.deadMoney).map((c) => impactScoreOf(c));
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...all)).toBeLessThanOrEqual(100);
  });

  it("carries a ± band and a tier for every player", () => {
    const jokic = impactComponents(named("Nikola Jokić"));
    expect(jokic.seasonTier).toBe("MVP");
    expect(jokic.uncertainty).toBeGreaterThan(0);
    expect(jokic.source).toBe("hybrid");
    expect(jokic.rapmp).toBeGreaterThan(5);
  });

  it("small-sample bench players don't outrank stars (Ty Jerome)", () => {
    // +7.7 BPM in 339 minutes — box-half, minutes-shrunk.
    const tj = named("Ty Jerome");
    expect(impactScoreOf(tj)).toBeLessThan(impactScoreOf(named("Stephen Curry")));
    expect(["MVP", "All-NBA"]).not.toContain(impactComponents(tj).seasonTier);
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
    // Use a buyer with headroom (a contender like OKC is already near the 73-win
    // cap, so it can't show a big lift). Miami has room; Jokić is worth ~+17.
    const moved = moveTo("Nikola Jokić", "MIA");
    const mia = teamProjection("MIA", moved)!;
    const den = teamProjection("DEN", moved)!;
    expect(mia.deltaWins).toBeGreaterThan(8);
    expect(den.deltaWins).toBeLessThan(-8);
  });

  it("positional displacement: stacking a spot benches the surplus", () => {
    // Drop a second quality center onto a team already anchored at center; the
    // position-aware rotation must push someone out of the 19,680-minute budget
    // rather than magically playing everyone.
    const moved = moveTo("Jarrett Allen", "SAS"); // SAS already has Wembanyama
    const before = allocateRotation(BASE_CONTRACTS.filter((c) => c.teamId === "SAS")).benched.length;
    const after = allocateRotation(moved.filter((c) => c.teamId === "SAS")).benched.length;
    expect(after).toBeGreaterThan(before);
  });

  it("the seller's loss barely depends on where the star is dealt", () => {
    // Losing a player is mostly a property of the roster he leaves. Under the
    // zero-sum standings a better-fitting buyer makes the whole league a touch
    // tougher for everyone (including the seller), so the seller's loss can now
    // differ by at most a win depending on the destination — no more.
    const a = teamProjection("DEN", moveTo("Nikola Jokić", "UTA"))!.deltaWins;
    const b = teamProjection("DEN", moveTo("Nikola Jokić", "BOS"))!.deltaWins;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it("a role player is marginal; a star is not", () => {
    // Same buyer with headroom: a role player barely moves the needle, an MVP
    // moves it a lot. (On a capped contender both shrink toward the ceiling.)
    const roleSwing = Math.abs(teamProjection("MIA", moveTo("Grayson Allen", "MIA"))!.deltaWins);
    const starSwing = Math.abs(teamProjection("MIA", moveTo("Nikola Jokić", "MIA"))!.deltaWins);
    // ≤4: the marginal rotation player a good role player now displaces can be a
    // projected rookie, so his swing is a touch larger than when it was always a
    // veteran — still marginal, and still dwarfed by a star.
    expect(roleSwing).toBeLessThanOrEqual(4);
    expect(starSwing).toBeGreaterThan(roleSwing + 8);
  });

  it("the aging prior never leaks into a no-move baseline", () => {
    // Aging is applied to both the live and base roster, so an untouched roster
    // returns exactly the model-native baseline. The aging layer is part of the
    // baseline now, but it must not create no-move drift.
    for (const t of ["OKC", "BOS", "DEN", "WAS"]) {
      const p = teamProjection(t, BASE_CONTRACTS)!;
      expect(p.deltaNrtg).toBe(0);
      expect(p.projWins).toBe(p.baseWins);
    }
  });

  it("projected wins are bounded 0-82, and real base rosters stay believable", () => {
    for (const t of TEAM_IDS) {
      const p = teamProjection(t, BASE_CONTRACTS);
      if (!p) continue;
      expect(p.projWins).toBeGreaterThanOrEqual(0); // a gutted roster CAN reach 0-82
      expect(p.projWins).toBeLessThanOrEqual(82);
      // but with no moves, every real team lands in a believable band
      expect(p.projWins).toBeGreaterThanOrEqual(10);
      expect(p.projWins).toBeLessThanOrEqual(75);
    }
  });

  it("model-native standings sum to EXACTLY 1,230 wins", () => {
    // Leaguewide apportionment rounds real-valued wins to integers that add up
    // to exactly 1,230 — no half-wins, no ties, the standings always balance.
    const wins = TEAM_IDS.reduce((sum, t) => sum + (teamProjection(t, BASE_CONTRACTS)?.baseWins ?? 0), 0);
    expect(wins).toBe(1230);
  });

  it("stays EXACTLY 1,230 after moves — improving a team takes wins from the field", () => {
    // Moving one star REDISTRIBUTES wins, never manufactures or destroys them:
    // the total holds at exactly 1,230 and the leaguewide delta sums to 0.
    const sumWins = (c: typeof BASE_CONTRACTS) =>
      TEAM_IDS.reduce((s, t) => s + (teamProjection(t, c)?.projWins ?? 0), 0);
    const sumDelta = (c: typeof BASE_CONTRACTS) =>
      TEAM_IDS.reduce((s, t) => s + (teamProjection(t, c)?.deltaWins ?? 0), 0);
    const live = BASE_CONTRACTS.map((c) =>
      /Joki|Jokić/.test(c.playerName) && !c.deadMoney ? { ...c, teamId: "WAS" } : c,
    );
    expect(sumWins(BASE_CONTRACTS)).toBe(1230);
    expect(sumWins(live)).toBe(1230); // total unchanged by the move
    expect(sumDelta(live)).toBe(0); // exactly zero-sum: every win one team gains, another loses
    expect(teamProjection("WAS", live)!.deltaWins).toBeGreaterThan(0); // gained the star
    expect(teamProjection("DEN", live)!.deltaWins).toBeLessThan(0); // lost the star
  });

  it("the exported team-strength snapshot mirrors the model-native baseline", () => {
    for (const t of TEAM_IDS) {
      const p = teamProjection(t, BASE_CONTRACTS)!;
      const s = teamStrengthOf(t)!;
      expect(s.projNrtg).toBe(p.baseNrtg);
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

  it("no rostered player is ever missing a position", () => {
    const rostered = BASE_CONTRACTS.filter((c) => currentSalary(c) > 0 && !c.deadMoney);
    const missing = rostered.filter((c) => !positionOf(c.playerId));
    expect(missing.map((c) => c.playerName)).toEqual([]);
  });

  it("measured secondary positions are real and distinct from the primary", () => {
    const withSec = Object.keys(SECONDARY_POSITIONS_2026);
    expect(withSec.length).toBeGreaterThan(50); // a meaningful share are versatile
    for (const id of withSec) {
      const primary = positionOf(id);
      for (const sec of SECONDARY_POSITIONS_2026[id]!) {
        expect(["PG", "SG", "SF", "PF", "C"]).toContain(sec);
        expect(sec).not.toBe(primary); // secondary ≠ primary
      }
      // eligiblePositions leads with the primary, then the secondaries
      expect(eligiblePositions(id)[0]).toBe(primary);
    }
  });
});

describe("pedigree-floored value (aging stars stay impactful)", () => {
  const named2 = (n: string) => BASE_CONTRACTS.find((c) => c.playerName === n && !c.deadMoney)!;

  it("recovers an injury-shortened star from his body of work + accolades", () => {
    // Anthony Davis (a 20-game 2025-26) reads near replacement raw, but his
    // strong 2023-25 BPM and All-NBA/All-Defensive honors keep him a star.
    const ad = named2("Anthony Davis");
    expect(IMPACT_2026.byId[ad.playerId]!.av).toBeLessThan(60); // raw is depressed
    expect(adjustedAv(ad)).toBeGreaterThan(70); // multi-year + accolades restore him
  });

  it("keeps aging stars impactful (LeBron, Curry, Draymond all clearly positive)", () => {
    for (const n of ["LeBron James", "Stephen Curry", "Draymond Green"]) {
      expect(impactMeterOf(named2(n))).toBeGreaterThan(2); // real positive impact
    }
  });

  it("does not inflate role players without pedigree", () => {
    // A journeyman's adjusted value tracks his current form, not a star floor.
    for (const n of ["De'Anthony Melton", "Grayson Allen"]) {
      const c = BASE_CONTRACTS.find((x) => x.playerName === n);
      if (c) expect(adjustedAv(c)).toBeLessThan(62);
    }
  });

  it("adjusted value stays on the 0-100 scale", () => {
    for (const c of BASE_CONTRACTS.filter((x) => !x.deadMoney && currentSalary(x) > 0)) {
      const v = adjustedAv(c);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("fit engine (dimensions + team chemistry)", () => {
  const move = (name: string, to: string) => {
    const p = BASE_CONTRACTS.find((c) => c.playerName === name)!;
    return BASE_CONTRACTS.map((c) => (c.playerId === p.playerId ? { ...c, teamId: to } : c));
  };
  const teamRoster = (t: string, contracts = BASE_CONTRACTS) => contracts.filter((c) => c.teamId === t);

  it("every rated player has a real dimensional profile", () => {
    const ids = Object.keys(IMPACT_2026.byId);
    const withDims = ids.filter((id) => PLAYER_DIMENSIONS_2026[id]);
    expect(withDims.length).toBe(ids.length); // 100% coverage
    for (const id of withDims.slice(0, 50)) {
      const d = PLAYER_DIMENSIONS_2026[id]!;
      for (const k of ["off", "def", "play", "reb", "space", "rim", "perd"] as const) {
        expect(d[k]).toBeGreaterThanOrEqual(0);
        expect(d[k]).toBeLessThanOrEqual(100);
      }
    }
  });

  it("the team-fit adjustment is bounded and never leaks into a no-move baseline", () => {
    for (const t of TEAM_IDS) {
      const f = teamFit(teamRoster(t)).nrtg;
      expect(Math.abs(f)).toBeLessThanOrEqual(6.001);
      // fit is applied as a delta, so an untouched roster keeps the exact baseline
      expect(teamProjection(t, BASE_CONTRACTS)!.deltaNrtg).toBe(0);
    }
  });

  it("an elite rim protector lifts a rim-needy team's fit more than a stacked one", () => {
    // Find the team whose fit gains most from adding Wembanyama, and one that
    // gains ~nothing (already anchored inside). The needy team must gain more.
    const gain = (t: string) =>
      teamFit(move("Victor Wembanyama", t).filter((c) => c.teamId === t)).nrtg - teamFit(teamRoster(t)).nrtg;
    const gains = TEAM_IDS.filter((t) => t !== "SAS").map((t) => ({ t, g: gain(t) })).sort((a, b) => b.g - a.g);
    expect(gains[0]!.g).toBeGreaterThan(1.5); // some team clearly needs rim protection
    expect(gains[0]!.g).toBeGreaterThan(gains[gains.length - 1]!.g + 1); // and gains far more than the least-needy
  });

  it("versatile players split their minutes across positions (real usage)", () => {
    // A measured combo player (Devin Vassell: ~54% SG / 44% SF) should appear at
    // more than one spot, not be pinned to a single position.
    const vassell = BASE_CONTRACTS.find((c) => c.playerName === "Devin Vassell");
    if (vassell) {
      const rot = allocateRotation(BASE_CONTRACTS.filter((c) => c.teamId === vassell.teamId));
      const spots = (["PG", "SG", "SF", "PF", "C"] as const).filter((pos) => (rot.byPos[pos] ?? []).some((s) => s.playerId === vassell.playerId));
      expect(spots.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("no player is listed twice at the same position (Pass-1/Pass-2 spillback merges)", () => {
    // A split player can be placed partially at a spot in Pass 1, then have
    // leftover minutes spill back to that SAME spot in Pass 2 — the allocator
    // must merge, not emit a duplicate slot (which would double-key the UI).
    for (const t of TEAM_IDS) {
      const rot = allocateRotation(BASE_CONTRACTS.filter((c) => c.teamId === t));
      for (const pos of ["PG", "SG", "SF", "PF", "C"] as const) {
        const ids = (rot.byPos[pos] ?? []).map((s) => s.playerId);
        expect(new Set(ids).size, `${t} ${pos} has a duplicated player`).toBe(ids.length);
      }
    }
  });

  it("curated position overrides fill role-blind secondaries (small-ball fives get C, not SF)", () => {
    // Draymond Green plays no measured secondary in the play-by-play table, so
    // the generic PF→[SF,C] adjacency used to spill him to SF. The curated
    // override makes his real second spot — center, in small/death lineups —
    // rank ahead of SF everywhere his eligibility is read.
    expect(secondaryPositionsOf("greendr01")).toContain("C");
    const elig = eligiblePositions("greendr01");
    expect(elig[0]).toBe("PF");
    expect(elig.indexOf("C")).toBeGreaterThan(-1);
    expect(elig.indexOf("C")).toBeLessThan(elig.indexOf("SF")); // C before SF
    // Measured play-by-play primaries stay authoritative (Jalen Williams's PF
    // argmax was NOT overridden to a role guess).
    expect(positionOf("willija06")).toBe("PF");
  });

  it("team dimensions are sane and minutes-weighted", () => {
    for (const t of TEAM_IDS) {
      const d = teamDimensions(teamRoster(t));
      for (const k of ["off", "def", "play", "reb", "space", "rim", "perd"] as const) {
        expect(d[k]).toBeGreaterThanOrEqual(0);
        expect(d[k]).toBeLessThanOrEqual(100);
      }
      expect(d.alphas).toBeLessThanOrEqual(6);
    }
  });

  it("playerDims falls back gracefully for players without a measured profile", () => {
    const anyContract = BASE_CONTRACTS.find((c) => !PLAYER_DIMENSIONS_2026[c.playerId] && impactScoreOf(c) > 0);
    if (anyContract) {
      const d = playerDims(anyContract);
      expect(d.off).toBeGreaterThan(0);
      expect(d.def).toBeGreaterThan(0);
    }
  });
});

describe("real injury facts (not injury-prone tags)", () => {
  const teamRotationMinutes = (playerId: string, team: string) => {
    const rot = allocateRotation(BASE_CONTRACTS.filter((c) => c.teamId === team));
    let m = 0;
    for (const pos of ["PG", "SG", "SF", "PF", "C"]) for (const s of rot.byPos[pos] ?? []) if (s.playerId === playerId) m += s.minutes;
    return m;
  };

  it("carries real reported injuries with a type and a recovery estimate", () => {
    const majors = Object.values(PLAYER_INJURIES_2026).filter((i) => i.gamesOut >= 5);
    expect(majors.length).toBeGreaterThan(0);
    for (const inj of majors) {
      expect(inj.type.length).toBeGreaterThan(0);
      expect(inj.gamesOut).toBeGreaterThanOrEqual(5);
      expect(inj.gamesOut).toBeLessThanOrEqual(82);
    }
  });

  // The feed is a snapshot of LAST season's injury report, so `gamesOut` is time
  // missed in 2025-26 — it says nothing on its own about 2026-27. Charging next
  // season for it projected Jimmy Butler (January knee) and Moses Moody (March
  // knee) at 54 and 52 games when both are long healed by camp. What actually
  // crosses an offseason is the injury TYPE, so these two assert the split.
  // What carries across an offseason is the injury TYPE and DATE, never last
  // season's games-missed count. These three pin the whole rule.
  const minutesOf = (name: string) => {
    const c = BASE_CONTRACTS.find((x) => x.playerName === name && !x.deadMoney)!;
    expect(c, name).toBeTruthy();
    return teamRotationMinutes(c.playerId, c.teamId);
  };

  it("a tear from LAST season still eats into next season", () => {
    // Butler tore an ACL on Jan 20, 2026 and Moody a patellar tendon on Mar 23 —
    // both are rehabbing well past opening night, so neither gets a full year.
    expect(minutesOf("Jimmy Butler")).toBeLessThan(1800);
    expect(minutesOf("Moses Moody")).toBeLessThan(1200);
  });

  it("a tear far enough in the past does NOT", () => {
    // Lillard's Achilles is from Sep 25, 2025 — thirteen months out by opening
    // night. The old model still charged him for it.
    expect(minutesOf("Damian Lillard")).toBeGreaterThan(1500);
  });

  it("an April Achilles wipes out essentially the whole season", () => {
    // DiVincenzo tore his on Apr 25, 2026; a twelve-month window returns him
    // after the 2026-27 season is over.
    expect(minutesOf("Donte DiVincenzo")).toBeLessThan(200);
  });

  it("injuryOf reflects the reported facts (a torn ACL reads as one)", () => {
    const acl = Object.entries(PLAYER_INJURIES_2026).find(([, i]) => /ACL/i.test(i.type));
    if (acl) {
      const inj = injuryOf(acl[0]);
      expect(inj).toBeTruthy();
      expect(inj!.type).toMatch(/ACL/i);
      expect(inj!.desc.length).toBeGreaterThan(0);
    }
  });
});

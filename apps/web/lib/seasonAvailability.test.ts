import { describe, it, expect } from "vitest";
import { SEASON_2027 } from "@apron/data";
import { BASE_CONTRACTS, TEAM_IDS, seasonAvailability, seasonOutlook } from "@/lib/league";

// Oklahoma City on Nov 20, 2026: Chet Holmgren out about 23 of the 67 games
// left and Jalen Williams about 52. The simulator played all 67, and the
// playoffs, on a roster with two thirds of one and a fifth of the other. It
// now plays each stretch with who is expected on the floor, and the playoffs
// with who is expected back.
//
// There is no archive of past injury reports to test this against, so what it
// is allowed to change is bounded here and re-measured on every run.

const AVAIL = seasonAvailability(BASE_CONTRACTS);
const SIMS = 2000;
const DATED = seasonOutlook(BASE_CONTRACTS, SIMS);
const AVERAGED = seasonOutlook(BASE_CONTRACTS, SIMS, "averaged");

const gamesLeft = (team: string) =>
  SEASON_2027.games.filter((g) => (g.homePts == null || g.awayPts == null) && (g.home === team || g.away === team)).length;

describe("who plays, and when", () => {
  it("covers every remaining game of every team exactly once", () => {
    for (const t of TEAM_IDS) {
      const a = AVAIL[t]!;
      expect(a.stretches.reduce((s, x) => s + x.games, 0), t).toBe(gamesLeft(t));
      for (const s of a.stretches) expect(s.games, t).toBeGreaterThan(0);
    }
  });

  it("moves points between dates and adds none: a team's stretches average zero", () => {
    for (const t of TEAM_IDS) {
      const a = AVAIL[t]!;
      const n = gamesLeft(t);
      if (!n) continue;
      const mean = a.stretches.reduce((s, x) => s + x.adj * x.games, 0) / n;
      expect(Math.abs(mean), t).toBeLessThan(1e-9);
    }
  });

  it("each later stretch has fewer players out, and the same ones", () => {
    // Whether a return helps is the rating's opinion of the player, not a rule
    // here: Atlanta rates six tenths of a point lower with CJ McCollum back in
    // the rotation on Nov 20.
    for (const t of TEAM_IDS) {
      const a = AVAIL[t]!;
      for (let k = 1; k < a.stretches.length; k++) {
        const before = a.stretches[k - 1]!, after = a.stretches[k]!;
        expect(after.out.length, t).toBeLessThan(before.out.length);
        for (const id of after.out) expect(before.out, t + " " + id).toContain(id);
      }
      // With everyone back before the season ends, April is the last stretch.
      const last = a.stretches[a.stretches.length - 1];
      if (last && !last.out.length) expect(a.playoffAdj, t).toBe(last.adj);
    }
  });

  it("a team with nobody on a timeline plays every game on its average", () => {
    for (const t of TEAM_IDS) {
      const a = AVAIL[t]!;
      if (a.stretches.length > 1 || a.stretches[0]?.out.length) continue;
      expect(a.stretches[0]?.adj ?? 0, t).toBe(0);
      expect(a.playoffAdj, t).toBe(0);
    }
  });

  it("a short absence stays averaged: no stretch is shorter than three games out", () => {
    for (const t of TEAM_IDS) {
      const first = AVAIL[t]!.stretches[0];
      if (first?.out.length) expect(first.games, t).toBeGreaterThanOrEqual(3);
    }
  });

  it("no adjustment is larger than a star: 6 points of net rating", () => {
    for (const t of TEAM_IDS) {
      const a = AVAIL[t]!;
      for (const s of a.stretches) expect(Math.abs(s.adj), t).toBeLessThan(6);
      expect(Math.abs(a.playoffAdj), t).toBeLessThan(6);
    }
  });
});

describe("what it changes in the simulation", () => {
  it("season win totals barely move: under one win for any team", () => {
    let worst = 0, total = 0;
    for (const t of TEAM_IDS) {
      const d = Math.abs(DATED[t]!.wins - AVERAGED[t]!.wins);
      worst = Math.max(worst, d);
      total += d;
    }
    expect(worst).toBeLessThan(1);
    expect(total / TEAM_IDS.length).toBeLessThan(0.3);
  });

  it("the league wins the same number of games either way, and one team wins the title", () => {
    const sum = (out: typeof DATED, f: "wins" | "title") => TEAM_IDS.reduce((s, t) => s + out[t]![f], 0);
    expect(sum(DATED, "title")).toBeCloseTo(1, 6);
    expect(sum(AVERAGED, "title")).toBeCloseTo(1, 6);
    expect(sum(DATED, "wins")).toBeCloseTo(sum(AVERAGED, "wins"), 6);
  });

  it("title odds rise only for a team that is healthier in April than on average, and fall only for the rest", () => {
    // A team that gains more than two points of title odds has players coming
    // back; nobody gains that much from another team's injuries.
    for (const t of TEAM_IDS) {
      const d = DATED[t]!.title - AVERAGED[t]!.title;
      if (d > 0.02) expect(AVAIL[t]!.playoffAdj, t).toBeGreaterThan(0.5);
    }
  });

  it("a team's change in title odds follows its April adjustment", () => {
    // The team with the largest April adjustment among real contenders gains;
    // the contenders with none give it up between them.
    const contenders = TEAM_IDS.filter((t) => AVERAGED[t]!.title > 0.04);
    const up = contenders.filter((t) => AVAIL[t]!.playoffAdj > 1);
    const flat = contenders.filter((t) => AVAIL[t]!.playoffAdj < 0.25);
    for (const t of up) expect(DATED[t]!.title, t).toBeGreaterThan(AVERAGED[t]!.title);
    if (up.length) for (const t of flat) expect(DATED[t]!.title, t).toBeLessThan(AVERAGED[t]!.title + 0.005);
  });
});

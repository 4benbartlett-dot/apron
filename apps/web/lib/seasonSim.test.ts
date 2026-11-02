import { describe, it, expect } from "vitest";
import { GAME_MODEL, SEASON_2027 } from "@apron/data";
import { normCdf, posteriorRating, simulateSeason, fillSchedule, type SimTeam, type SimGame } from "@/lib/seasonSim";
import { BASE_CONTRACTS, TEAM_IDS, seasonOutlook, seasonRatings, PRIOR_WEIGHT_GAMES, teamMeta } from "@/lib/league";

const OPTS = { hca: GAME_MODEL.hca, marginSd: GAME_MODEL.marginSd };

/** A 30-team league of equal teams on a balanced home-and-home slate. */
function flatLeague(rating = (_i: number) => 0): { teams: SimTeam[]; games: SimGame[] } {
  const teams: SimTeam[] = Array.from({ length: 30 }, (_, i) => ({
    id: `T${i}`,
    conference: i < 15 ? "East" : "West",
    rating: rating(i),
    ratingSd: 0,
  }));
  const games: SimGame[] = [];
  // 41 rounds of a circle-method schedule, each pair once home and once away
  // where it lands: 30 teams × 82 games, every team 41 home.
  const ids = teams.map((t) => t.id);
  for (let round = 0; round < 82; round++) {
    const rot = [ids[0]!, ...ids.slice(1).map((_, k) => ids[1 + ((k + round) % 29)]!)];
    for (let k = 0; k < 15; k++) {
      const a = rot[k]!, b = rot[29 - k]!;
      games.push(round % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
  }
  return { teams, games };
}

describe("the single-game model", () => {
  it("Φ matches known values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normCdf(-1)).toBeCloseTo(0.1587, 4);
  });

  // The calibration is a measurement, and the measurement is sane: home court
  // is worth a point or two in the modern league, a single game's margin
  // swings by low teens, and the formula beats a coin flip by a clear margin.
  it("is calibrated on a completed season, and the numbers are plausible", () => {
    expect(GAME_MODEL.games).toBeGreaterThanOrEqual(1200);
    expect(GAME_MODEL.hca).toBeGreaterThan(0.5);
    expect(GAME_MODEL.hca).toBeLessThan(4);
    expect(GAME_MODEL.marginSd).toBeGreaterThan(10);
    expect(GAME_MODEL.marginSd).toBeLessThan(17);
    expect(GAME_MODEL.brier).toBeLessThan(0.22);
    // Season level, the simulator's own job: summed over a team's real
    // schedule, the game probabilities give back its real win total to about
    // three wins, and spread teams within 15% of how the league did per point.
    expect(GAME_MODEL.winsRmse).toBeLessThan(4.5);
    expect(Math.abs(GAME_MODEL.winsPerPointModel / GAME_MODEL.winsPerPointActual - 1)).toBeLessThan(0.15);
    // Each probability bucket lands within six points of what happened.
    for (const b of GAME_MODEL.calibration) expect(Math.abs(b.predicted - b.actual), JSON.stringify(b)).toBeLessThan(0.06);
  });
});

describe("the rating update", () => {
  it("returns the prior untouched before a game is played", () => {
    expect(posteriorRating(3, 3.5, -10, 0, 14)).toMatchObject({ mean: 3, sd: 3.5 });
  });

  it("weights the prior like k games, where k = marginSd² / priorSd²", () => {
    const k = (14 * 14) / (3.5 * 3.5); // 16
    const p = posteriorRating(0, 3.5, 8, 16, 14);
    expect(p.priorWeightGames).toBeCloseTo(k, 6);
    expect(p.mean).toBeCloseTo(4, 6); // 16 games of data = the prior's weight: halfway
    expect(p.sd).toBeCloseTo(3.5 / Math.SQRT2, 6);
  });

  it("is about 16 games on the measured constants", () => {
    expect(PRIOR_WEIGHT_GAMES).toBeGreaterThanOrEqual(10);
    expect(PRIOR_WEIGHT_GAMES).toBeLessThanOrEqual(25);
  });
});

describe("the season simulator", () => {
  it("fills a short schedule to 82 inside each conference, zero-sum", () => {
    const { teams, games } = flatLeague();
    const short = games.filter((_, i) => i % 41 !== 0); // knock a few games out
    const filled = fillSchedule(teams, short, 82);
    const count = new Map<string, number>();
    for (const g of filled) for (const t of [g.home, g.away]) count.set(t, (count.get(t) ?? 0) + 1);
    const conf = (id: string) => teams.find((t) => t.id === id)!.conference;
    for (const g of filled.slice(short.length)) expect(conf(g.home)).toBe(conf(g.away));
    expect([...count.values()].every((n) => n === 82 || n === 81)).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const { teams, games } = flatLeague((i) => i / 3);
    const a = simulateSeason(teams, games, { ...OPTS, sims: 300, seed: 7 });
    const b = simulateSeason(teams, games, { ...OPTS, sims: 300, seed: 7 });
    expect(a).toEqual(b);
  });

  it("gives equal teams equal odds, and every pool of odds sums to its slots", () => {
    const { teams, games } = flatLeague();
    const out = Object.values(simulateSeason(teams, games, { ...OPTS, sims: 3000 }));
    const sum = (k: keyof (typeof out)[number]) => out.reduce((s, o) => s + (o[k] as number), 0);
    expect(sum("wins")).toBeCloseTo(1230, 6);
    expect(sum("title")).toBeCloseTo(1, 6);
    expect(sum("finals")).toBeCloseTo(2, 6);
    expect(sum("confFinals")).toBeCloseTo(4, 6);
    expect(sum("playoffs")).toBeCloseTo(16, 6);
    expect(sum("top6")).toBeCloseTo(12, 6);
    expect(sum("playIn")).toBeCloseTo(8, 6);
    for (const o of out) {
      expect(o.wins).toBeGreaterThan(39);
      expect(o.wins).toBeLessThan(43);
      expect(o.title).toBeLessThan(0.07);
    }
  });

  it("rewards a better team in every column", () => {
    const { teams, games } = flatLeague((i) => (i === 0 ? 8 : 0));
    const out = simulateSeason(teams, games, { ...OPTS, sims: 2000 });
    const star = out.T0!, avg = out.T1!;
    expect(star.wins).toBeGreaterThan(avg.wins + 15);
    expect(star.playoffs).toBeGreaterThan(0.97);
    expect(star.title).toBeGreaterThan(5 * avg.title);
  });

  it("widens the range with rating uncertainty", () => {
    const sure = flatLeague((i) => (i % 2 ? 2 : -2));
    const unsure = { ...sure, teams: sure.teams.map((t) => ({ ...t, ratingSd: 4 })) };
    const a = simulateSeason(sure.teams, sure.games, { ...OPTS, sims: 2000 }).T1!;
    const b = simulateSeason(unsure.teams, unsure.games, { ...OPTS, sims: 2000 }).T1!;
    expect(b.winsHi - b.winsLo).toBeGreaterThan(a.winsHi - a.winsLo);
  });
});

describe("2026-27 as it stands", () => {
  it("has a full schedule and a rating row for every team", () => {
    expect(SEASON_2027.games.length).toBeGreaterThanOrEqual(1200);
    for (const t of TEAM_IDS) expect(SEASON_2027.ratings[t], t).toBeDefined();
  });

  it("counts each team's record from the scores, matching bref's table", () => {
    const out = seasonOutlook(BASE_CONTRACTS, 50);
    for (const t of TEAM_IDS) {
      expect(out[t]!.w, t).toBe(SEASON_2027.ratings[t]!.w);
      expect(out[t]!.l, t).toBe(SEASON_2027.ratings[t]!.l);
    }
  });

  it("keeps every rating on the projection's scale, centered near zero", () => {
    const r = seasonRatings(BASE_CONTRACTS);
    const mean = r.reduce((s, t) => s + t.rating, 0) / r.length;
    expect(Math.abs(mean)).toBeLessThan(1);
    for (const t of r) {
      expect(Math.abs(t.rating), t.id).toBeLessThan(15);
      expect(t.conference).toBe(teamMeta(t.id).conference);
    }
  });

  it("sums to a league: 1,230 wins, one champion, sixteen playoff teams", () => {
    const out = Object.values(seasonOutlook(BASE_CONTRACTS, 1000));
    expect(out.reduce((s, o) => s + o.wins, 0)).toBeCloseTo(1230, 6);
    expect(out.reduce((s, o) => s + o.title, 0)).toBeCloseTo(1, 6);
    expect(out.reduce((s, o) => s + o.playoffs, 0)).toBeCloseTo(16, 6);
  });
});

describe("a staged move reaches the odds", () => {
  // Same seed for both runs, so the difference is the trade's: send the
  // league's best player to its worst roster and both teams' odds move the
  // way they must, by a lot.
  it("moving Gilgeous-Alexander to Sacramento helps Sacramento and costs Oklahoma City", () => {
    const sga = BASE_CONTRACTS.find((c) => c.playerName === "Shai Gilgeous-Alexander" && !c.deadMoney)!;
    expect(sga.teamId).toBe("OKC");
    const moved = BASE_CONTRACTS.map((c) => (c === sga ? { ...c, teamId: "SAC" } : c));
    const before = seasonOutlook(BASE_CONTRACTS, 1500);
    const after = seasonOutlook(moved, 1500);
    expect(after.SAC!.wins).toBeGreaterThan(before.SAC!.wins + 3);
    expect(after.OKC!.wins).toBeLessThan(before.OKC!.wins - 3);
    expect(after.OKC!.title).toBeLessThan(before.OKC!.title);
    // Games already played don't change.
    expect(after.SAC!.w).toBe(before.SAC!.w);
  });
});

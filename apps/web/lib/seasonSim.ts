/**
 * THE SEASON SIMULATOR — the rest of 2026-27 played out a few thousand times.
 *
 * Every number in here is either measured or derived from something measured:
 *
 *   - A game: the home side wins with Φ((rHome − rAway + hca) / marginSd).
 *     hca and marginSd come from 2025-26's 1,230 games
 *     (scripts/calibrate-game-model.mjs, game-model-calibration.json).
 *   - A team's rating: the preseason model's projection (the board's own
 *     net rating, CV-RMSE 3.5 points on 240 team-seasons) updated by what
 *     the team has actually done. That is a normal-normal update, so the
 *     prior is worth marginSd² / priorSd² games — about 16 — and the model
 *     does not have to be told how fast to trust October.
 *   - Uncertainty: each simulated season draws each team's TRUE rating from
 *     that posterior before it plays a game, so a team that might be +4 or
 *     might be −2 gets the wide range of records it should, not just the
 *     coin-flip noise of 82 games around one number.
 *
 * Simplified, and said so on the page: tiebreakers are a coin flip rather
 * than the NBA's head-to-head/division chain; the two games each team has
 * left to schedule after the NBA Cup group stage are paired inside its
 * conference at a neutral site; the Cup knockout games themselves (which do
 * not count) are not modeled. Seeded RNG, so the page, the server and the
 * tests all see the same odds for the same inputs.
 */

export interface SimTeam {
  id: string;
  conference: "East" | "West";
  /** Mean rating for the games left, points per game vs. an average team. */
  rating: number;
  /** SD of that rating — the posterior's, so it narrows as games are played. */
  ratingSd: number;
}

export interface SimGame {
  home: string;
  away: string;
  /** Final score, when the game has been played. */
  homePts?: number;
  awayPts?: number;
  neutral?: boolean;
}

export interface SimOptions {
  sims?: number;
  seed?: number;
  hca: number;
  marginSd: number;
  /** Regular-season length; teams short of it get the gap filled (see top). */
  seasonGames?: number;
}

export interface TeamOutlook {
  id: string;
  /** Record so far. */
  w: number;
  l: number;
  /** Mean final wins, and the 10th/90th percentile. */
  wins: number;
  winsLo: number;
  winsHi: number;
  /** Probability of a top-6 finish (no play-in). */
  top6: number;
  /** Probability of a 7–10 finish (into the play-in). */
  playIn: number;
  /** Probability of reaching the first round (top 6, or through the play-in). */
  playoffs: number;
  topSeed: number;
  confFinals: number;
  finals: number;
  title: number;
}

/** Φ, by the Abramowitz–Stegun 7.1.26 erf (|error| < 1.5e-7). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** mulberry32: small, fast, seedable; plenty for a few million coin flips. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box–Muller; the second value is discarded). */
function gauss(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/**
 * The normal-normal update of a preseason rating by results. `observed` is
 * the team's (schedule-adjusted) net rating over `games` games; each game's
 * margin has SD `marginSd`, so the average over g games has variance
 * marginSd² / g. With no games the prior comes back untouched.
 */
export function posteriorRating(
  prior: number,
  priorSd: number,
  observed: number,
  games: number,
  marginSd: number,
): { mean: number; sd: number; priorWeightGames: number } {
  const priorWeightGames = (marginSd * marginSd) / (priorSd * priorSd);
  if (games <= 0) return { mean: prior, sd: priorSd, priorWeightGames };
  const mean = (prior * priorWeightGames + observed * games) / (priorWeightGames + games);
  const sd = Math.sqrt(1 / (1 / (priorSd * priorSd) + games / (marginSd * marginSd)));
  return { mean, sd, priorWeightGames };
}

/** Each team short of `seasonGames` gets the shortfall as neutral-site games
 * against the next teams in its conference, in a fixed order, so the filler
 * is zero-sum and the same every run. */
export function fillSchedule(teams: SimTeam[], games: SimGame[], seasonGames: number): SimGame[] {
  const count = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (const g of games) {
    count.set(g.home, (count.get(g.home) ?? 0) + 1);
    count.set(g.away, (count.get(g.away) ?? 0) + 1);
  }
  const out = [...games];
  for (const conf of ["East", "West"] as const) {
    const ids = teams.filter((t) => t.conference === conf).map((t) => t.id).sort();
    const need = (id: string) => seasonGames - (count.get(id) ?? 0);
    // Pair the two neediest teams (alphabetical on a tie), one game at a
    // time. Fifteen teams two games short each close out in fifteen games;
    // pairing in passes instead strands the odd team out. A lone team left
    // short (odd total) stays short, which a real slate never produces.
    for (let guard = 0; guard < 1000; guard++) {
      const s = ids.filter((id) => need(id) > 0).sort((x, y) => need(y) - need(x) || x.localeCompare(y));
      if (s.length < 2) break;
      out.push({ home: s[0]!, away: s[1]!, neutral: true });
      count.set(s[0]!, count.get(s[0]!)! + 1);
      count.set(s[1]!, count.get(s[1]!)! + 1);
    }
  }
  return out;
}

export function simulateSeason(teams: SimTeam[], schedule: SimGame[], opts: SimOptions): Record<string, TeamOutlook> {
  const sims = opts.sims ?? 5000;
  const r = rng(opts.seed ?? 20261020);
  const { hca, marginSd } = opts;
  const n = teams.length;
  const idx = new Map(teams.map((t, i) => [t.id, i]));
  const games = fillSchedule(teams, schedule, opts.seasonGames ?? 82);

  // Results so far are fixed; only the games left get simulated.
  const w0 = new Int32Array(n);
  const l0 = new Int32Array(n);
  const left: { h: number; a: number; edge: number }[] = [];
  for (const g of games) {
    const h = idx.get(g.home);
    const a = idx.get(g.away);
    if (h == null || a == null) continue;
    if (g.homePts != null && g.awayPts != null) {
      if (g.homePts > g.awayPts) { w0[h]++; l0[a]++; } else { w0[a]++; l0[h]++; }
    } else left.push({ h, a, edge: g.neutral ? 0 : hca });
  }

  const east = teams.map((t, i) => (t.conference === "East" ? i : -1)).filter((i) => i >= 0);
  const west = teams.map((t, i) => (t.conference === "West" ? i : -1)).filter((i) => i >= 0);

  const tally = {
    wins: new Float64Array(n),
    top6: new Int32Array(n),
    playIn: new Int32Array(n),
    playoffs: new Int32Array(n),
    topSeed: new Int32Array(n),
    confFinals: new Int32Array(n),
    finals: new Int32Array(n),
    title: new Int32Array(n),
  };
  const winDist: Int32Array[] = teams.map(() => new Int32Array(83));

  const true_ = new Float64Array(n);
  const wins = new Int32Array(n);
  const pGame = (home: number, away: number, edge: number) => normCdf((true_[home]! - true_[away]! + edge) / marginSd);
  const game = (home: number, away: number) => (r() < pGame(home, away, hca) ? home : away);
  // Best of seven, 2-2-1-1-1, the higher seed at home in games 1, 2, 5, 7.
  const series = (hi: number, lo: number) => {
    let a = 0, b = 0, k = 0;
    while (a < 4 && b < 4) {
      const hiHome = k === 0 || k === 1 || k === 4 || k === 6;
      const winner = hiHome ? game(hi, lo) : game(lo, hi);
      if (winner === hi) a++; else b++;
      k++;
    }
    return a === 4 ? hi : lo;
  };

  /** One conference's playoffs: seeds the standings, runs the play-in and
   * three rounds, and returns its champion. */
  const conference = (ids: number[]) => {
    // Coin-flip tiebreak: a sub-1 jitter never reorders different win totals.
    // Keys drawn once per team: a comparator that rolls dice is not a sort.
    const key = new Map(ids.map((t) => [t, wins[t]! + 0.5 * r()]));
    const order = [...ids].sort((x, y) => key.get(y)! - key.get(x)!);
    order.forEach((t, k) => {
      if (k < 6) tally.top6[t]++;
      else if (k < 10) tally.playIn[t]++;
    });
    tally.topSeed[order[0]!]++;
    const s = order.slice(0, 10);
    const w78 = game(s[6]!, s[7]!);
    const l78 = w78 === s[6] ? s[7]! : s[6]!;
    const w910 = game(s[8]!, s[9]!);
    const eighth = game(l78, w910);
    const seeds = [...s.slice(0, 6), w78, eighth];
    for (const t of seeds) tally.playoffs[t]++;
    // Earlier seed = higher seed = home court.
    const sr = (x: number, y: number) => (seeds.indexOf(x) < seeds.indexOf(y) ? series(x, y) : series(y, x));
    const a = sr(seeds[0]!, seeds[7]!);
    const b = sr(seeds[3]!, seeds[4]!);
    const c = sr(seeds[2]!, seeds[5]!);
    const d = sr(seeds[1]!, seeds[6]!);
    const top = sr(a, b);
    const bottom = sr(c, d);
    tally.confFinals[top]++;
    tally.confFinals[bottom]++;
    const champ = sr(top, bottom);
    tally.finals[champ]++;
    return champ;
  };

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      true_[i] = teams[i]!.rating + teams[i]!.ratingSd * gauss(r);
      wins[i] = w0[i]!;
    }
    for (const g of left) {
      if (r() < pGame(g.h, g.a, g.edge)) wins[g.h]++;
      else wins[g.a]++;
    }
    for (let i = 0; i < n; i++) {
      tally.wins[i] += wins[i]!;
      winDist[i]![Math.min(82, wins[i]!)]++;
    }
    const e = conference(east);
    const w = conference(west);
    // The Finals: home court to the better record (coin flip on a tie).
    const champ = wins[e]! + r() * 0.5 > wins[w]! + r() * 0.5 ? series(e, w) : series(w, e);
    tally.title[champ]++;
  }

  const pct = (dist: Int32Array, q: number) => {
    let acc = 0;
    for (let k = 0; k < dist.length; k++) {
      acc += dist[k]!;
      if (acc >= q * sims) return k;
    }
    return dist.length - 1;
  };
  const out: Record<string, TeamOutlook> = {};
  teams.forEach((t, i) => {
    out[t.id] = {
      id: t.id,
      w: w0[i]!,
      l: l0[i]!,
      wins: tally.wins[i]! / sims,
      winsLo: pct(winDist[i]!, 0.1),
      winsHi: pct(winDist[i]!, 0.9),
      top6: tally.top6[i]! / sims,
      playIn: tally.playIn[i]! / sims,
      playoffs: tally.playoffs[i]! / sims,
      topSeed: tally.topSeed[i]! / sims,
      confFinals: tally.confFinals[i]! / sims,
      finals: tally.finals[i]! / sims,
      title: tally.title[i]! / sims,
    };
  });
  return out;
}

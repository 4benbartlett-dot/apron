import { describe, it, expect } from "vitest";
import { EARLY_SEASON, PLAYER_STATS_2026, PROJECTED_PLAYERS_2026, ROOKIES_2026, ROOKIE_PROJECTIONS_2026 } from "@apron/data";
import { BASE_CONTRACTS, priorMinutesFor } from "@/lib/league";

// The in-season blend's one number is a measurement
// (scripts/calibrate-early-season.mjs). These hold a re-run to the bar it
// cleared the first time: it helps on seasons it wasn't fit on, the weight
// doesn't depend much on how far in the season is, and believing the season
// outright is worse than the blend.
describe("early-season weight, backtested on five seasons", () => {
  it("covers five completed seasons and thousands of player-snapshots", () => {
    expect(EARLY_SEASON.seasons.length).toBeGreaterThanOrEqual(5);
    expect(EARLY_SEASON.pooled.n).toBeGreaterThan(5000);
  });

  it("puts the prior at roughly a thousand minutes of this season's play", () => {
    expect(EARLY_SEASON.priorMinutes).toBeGreaterThan(500);
    expect(EARLY_SEASON.priorMinutes).toBeLessThan(2000);
  });

  it("beats the prior alone on every season held out of the fit", () => {
    for (const s of EARLY_SEASON.leaveOneSeasonOut) expect(s.rmse, String(s.season)).toBeLessThan(s.priorOnly);
  });

  it("beats believing the season outright", () => {
    expect(EARLY_SEASON.pooled.rmse).toBeLessThan(EARLY_SEASON.pooled.seasonOnly);
  });

  it("finds about the same weight 8 games in as 38", () => {
    for (const c of EARLY_SEASON.byCutoff) {
      expect(c.M / EARLY_SEASON.priorMinutes, `~${c.games} games`).toBeGreaterThan(0.6);
      expect(c.M / EARLY_SEASON.priorMinutes, `~${c.games} games`).toBeLessThan(1.5);
      // and the pooled weight costs almost nothing against each cutoff's own best
      expect(c.atPooledM - c.rmse).toBeLessThan(0.01);
    }
  });
});

// A rookie's preseason read is a projection from draft slot and college, not
// three NBA seasons, and the same back-test says it is worth fewer minutes.
// Draft slot alone as the prior fits best at 525; the board's projection reads
// more than slot, so the board uses 750, between the fit and the veterans'.
describe("a rookie's weight, backtested on the rookies of the same five seasons", () => {
  const R = EARLY_SEASON.rookies;

  it("covers about two hundred rookie seasons", () => {
    expect(R.players).toBeGreaterThan(150);
    expect(R.pooled.n).toBeGreaterThan(600);
  });

  it("fits a rookie's prior at fewer minutes than a veteran's", () => {
    expect(R.pooled.M).toBeLessThan(EARLY_SEASON.priorMinutes);
  });

  it("uses a weight between the fit and the veterans'", () => {
    expect(R.priorMinutes).toBeGreaterThanOrEqual(R.pooled.M);
    expect(R.priorMinutes).toBeLessThan(EARLY_SEASON.priorMinutes);
  });

  it("at that weight, beats the veterans' weight and gives up under 0.01 to the fit", () => {
    expect(R.atPriorMinutes).toBeLessThan(R.atVeteranM);
    expect(R.atPriorMinutes - R.pooled.rmse).toBeLessThan(0.01);
  });

  it("beats draft slot alone in every season, and the veterans' weight in four of five", () => {
    for (const s of R.leaveOneSeasonOut) expect(s.atPriorMinutes, String(s.season)).toBeLessThan(s.priorOnly);
    // 2021-22 is the one that went the other way: 1.742 against 1.726.
    const better = R.leaveOneSeasonOut.filter((s) => s.atPriorMinutes < s.atVeteranM);
    expect(better.length).toBeGreaterThanOrEqual(4);
    for (const s of R.leaveOneSeasonOut) expect(s.atPriorMinutes - s.atVeteranM, String(s.season)).toBeLessThan(0.03);
  });
});

describe("who gets the rookie weight on the board", () => {
  it("the 2026 class does, and nobody with an NBA season behind him", () => {
    const rookies = ROOKIES_2026.filter((r) => r.playerId in ROOKIE_PROJECTIONS_2026 && !PLAYER_STATS_2026[r.playerId]?.mp);
    expect(rookies.length).toBeGreaterThan(40);
    for (const r of rookies) expect(priorMinutesFor(r.playerId), r.playerName).toBe(EARLY_SEASON.rookies.priorMinutes);
    // AJ Dybantsa, the first pick.
    expect(priorMinutesFor("dybanaj01")).toBe(750);
    for (const c of BASE_CONTRACTS) {
      if (PLAYER_STATS_2026[c.playerId]?.mp) expect(priorMinutesFor(c.playerId), c.playerName).toBe(EARLY_SEASON.priorMinutes);
    }
  });

  it("a projected player who is not a rookie keeps the veterans' weight", () => {
    // Returning veterans are projected too. They are not in the rookie file.
    const returning = Object.keys(PROJECTED_PLAYERS_2026).filter((id) => !(id in ROOKIE_PROJECTIONS_2026));
    expect(returning.length).toBeGreaterThan(0);
    for (const id of returning) expect(priorMinutesFor(id), id).toBe(EARLY_SEASON.priorMinutes);
  });
});

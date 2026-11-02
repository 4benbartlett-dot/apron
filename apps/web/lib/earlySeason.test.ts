import { describe, it, expect } from "vitest";
import { EARLY_SEASON } from "@apron/data";

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

import { describe, it, expect } from "vitest";
import {
  CALENDAR_2026_27 as CAL,
  SEASON_2025_26,
  SEASON_2026_27,
  LEAGUE_PHASES,
  leaguePhaseOn,
  phaseStarts,
  isRegularSeason,
  tradeWindowOpen,
  tradeTimingOn,
  regularSeasonDays,
  seasonDaysLeft,
  lastSeasonEndBy,
  isLeagueCalendar,
  type LeaguePhase,
} from "../src";

// The league year is one state machine with one input, the date. These pin its
// states, its boundaries, and the one table the dates are written in.
describe("the league year's phases", () => {
  it("each phase starts on its own first day and the one before it ends the day earlier", () => {
    const starts = phaseStarts(CAL);
    const dayBefore = (iso: string) => {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };
    LEAGUE_PHASES.forEach((phase, i) => {
      expect(leaguePhaseOn(starts[phase], CAL), `${phase} on its first day`).toBe(phase);
      if (i > 0) expect(leaguePhaseOn(dayBefore(starts[phase]), CAL), `the day before ${phase}`).toBe(LEAGUE_PHASES[i - 1]);
    });
  });

  it("puts the dates the app used to type by hand where it typed them", () => {
    const on = (d: string): LeaguePhase => leaguePhaseOn(d, CAL);
    expect(on("2026-07-15")).toBe("offseason");
    expect(on("2026-09-30")).toBe("offseason");
    expect(on("2026-10-01")).toBe("camp");
    expect(on("2026-10-19")).toBe("camp");
    expect(on("2026-10-20")).toBe("pre_dec15");
    expect(on("2026-11-09")).toBe("pre_dec15");
    expect(on("2026-12-14")).toBe("pre_dec15");
    expect(on("2026-12-15")).toBe("dec15_to_deadline");
    expect(on("2027-02-11")).toBe("dec15_to_deadline"); // the deadline day itself
    expect(on("2027-02-12")).toBe("post_deadline");
    expect(on("2027-04-11")).toBe("post_deadline");
    expect(on("2027-04-12")).toBe("postseason");
    expect(on("2027-06-30")).toBe("postseason");
  });

  it("is in season from opening night through the last day, and trades stop only after the deadline", () => {
    expect(isRegularSeason("2026-10-19", CAL)).toBe(false);
    expect(isRegularSeason("2026-10-20", CAL)).toBe(true);
    expect(isRegularSeason("2027-04-11", CAL)).toBe(true);
    expect(isRegularSeason("2027-04-12", CAL)).toBe(false);
    expect(tradeWindowOpen("2027-02-11", CAL)).toBe(true);
    expect(tradeWindowOpen("2027-02-12", CAL)).toBe(false);
    expect(tradeWindowOpen("2027-04-12", CAL)).toBe(true); // the offseason's trades start the next day
  });

  it("is the calendar the season's constants carry", () => {
    expect(SEASON_2026_27.calendar).toBe(CAL);
    expect(isLeagueCalendar(SEASON_2026_27.calendar)).toBe(true);
    // 2025-26 has only its last day and June 30: enough for the post-season window.
    expect(isLeagueCalendar(SEASON_2025_26.calendar)).toBe(false);
  });
});

describe("the minimum-player aggregation bucket (Art. VII §6(j)(4)(ii))", () => {
  it("is read off the date: camp is offseason, and everything after the deadline is post-deadline", () => {
    expect(tradeTimingOn("2026-07-15", CAL)).toBe("offseason");
    expect(tradeTimingOn("2026-10-10", CAL)).toBe("offseason");
    expect(tradeTimingOn("2026-11-09", CAL)).toBe("pre_dec15");
    expect(tradeTimingOn("2026-12-15", CAL)).toBe("dec15_to_deadline");
    expect(tradeTimingOn("2027-02-11", CAL)).toBe("dec15_to_deadline");
    expect(tradeTimingOn("2027-03-01", CAL)).toBe("post_deadline");
    expect(tradeTimingOn("2027-05-01", CAL)).toBe("post_deadline");
  });

  it("falls back to offseason, where the limit applies, with no date or no dated calendar", () => {
    expect(tradeTimingOn(undefined, CAL)).toBe("offseason");
    expect(tradeTimingOn("2027-01-10", undefined)).toBe("offseason");
    expect(tradeTimingOn("2026-01-10", SEASON_2025_26.calendar)).toBe("offseason");
  });
});

describe("the season by the day", () => {
  it("is 174 days long, the count a minimum contract is paid by", () => {
    expect(regularSeasonDays(CAL)).toBe(174);
  });

  it("counts the days a contract signed in season is paid for, signing day included", () => {
    expect(seasonDaysLeft("2026-09-01", CAL)).toBe(174);
    expect(seasonDaysLeft("2026-10-20", CAL)).toBe(174);
    expect(seasonDaysLeft("2026-11-04", CAL)).toBe(159); // Dalen Terry's Oklahoma City deal
    expect(seasonDaysLeft("2027-04-11", CAL)).toBe(1);
    expect(seasonDaysLeft("2027-04-12", CAL)).toBe(0);
  });

  it("knows the last season to have ended, which is when an exception's first-apron limit attaches", () => {
    const cals = [SEASON_2025_26.calendar, CAL];
    expect(lastSeasonEndBy("2026-11-09", cals)).toBe("2026-04-12");
    expect(lastSeasonEndBy("2027-04-11", cals)).toBe("2026-04-12"); // the last day is still in season
    expect(lastSeasonEndBy("2027-04-12", cals)).toBe("2027-04-11");
    expect(lastSeasonEndBy("2026-01-01", cals)).toBeNull();
  });
});

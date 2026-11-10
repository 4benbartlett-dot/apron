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
  exceptionShareOn,
  veteranExtensionOpenOn,
  isOffseason,
  spendingPower,
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

// Art. VII §6(n)(4). The mid-level and bi-annual exceptions shrink by a day's
// worth each day from January 10, but not for a team using one between
// January 10 and the trade deadline. So the full amount lasts through
// deadline day, and the day after it every day since January 10 is gone.
describe("an unused exception after the trade deadline", () => {
  it("is whole through deadline day and short 34 of 174 days the morning after", () => {
    expect(exceptionShareOn("2026-11-09", CAL)).toBe(1);
    expect(exceptionShareOn("2027-01-10", CAL)).toBe(1);
    expect(exceptionShareOn("2027-02-11", CAL)).toBe(1);
    expect(exceptionShareOn("2027-02-12", CAL)).toBeCloseTo(1 - 34 / 174, 10);
    expect(exceptionShareOn("2027-03-01", CAL)).toBeCloseTo(1 - 51 / 174, 10);
  });

  it("stops shrinking when the Regular Season does, and is whole with no date or no calendar", () => {
    const last = exceptionShareOn("2027-04-11", CAL);
    expect(last).toBeCloseTo(1 - 92 / 174, 10);
    expect(exceptionShareOn("2027-05-20", CAL)).toBe(last);
    expect(exceptionShareOn(undefined, CAL)).toBe(1);
    expect(exceptionShareOn("2026-03-01", SEASON_2025_26.calendar)).toBe(1);
  });

  it("reaches the mid-level a team can offer, and leaves the minimum alone", () => {
    const C = SEASON_2026_27;
    const overCap = C.salaryCap + 10_000_000;
    const mle = (date?: string, opts = {}) =>
      spendingPower(overCap, C, { date, ...opts }).mechanisms.find((m) => m.id === "ntmle")!.maxSalary;
    const min = (date?: string) => spendingPower(overCap, C, { date }).mechanisms.find((m) => m.id === "minimum")!.maxSalary;
    expect(mle("2027-02-11")).toBe(C.nonTaxpayerMLE);
    expect(mle("2027-02-12")).toBe(Math.round(C.nonTaxpayerMLE * (1 - 34 / 174)));
    expect(min("2027-02-12")).toBe(min("2027-02-11"));
    // $5M spent in July came off before the reduction; $2M spent today comes off after it.
    const july = 5_000_000;
    const today = 2_000_000;
    expect(mle("2027-02-12", { consumed: { ntmle: july + today }, consumedOnDate: { ntmle: today } })).toBe(
      Math.round((C.nonTaxpayerMLE - july) * (1 - 34 / 174)) - today,
    );
  });
});

// Art. VII §7(a)(1): an extension signed more than a year before the July 1
// that precedes its first season "may only be negotiated and entered into
// during the off-season". Jaylen Brown, with three seasons left in November
// 2026, could be extended on the board. He can't be until July.
describe("when a veteran extension can be signed", () => {
  it("in season, only a contract in its last season can be extended", () => {
    expect(veteranExtensionOpenOn("2026-11-09", "2027-28", CAL)).toEqual({ open: true, offseasonOnly: false });
    expect(veteranExtensionOpenOn("2026-11-09", "2028-29", CAL)).toEqual({ open: false, offseasonOnly: true });
    expect(veteranExtensionOpenOn("2027-02-11", "2029-30", CAL)).toEqual({ open: false, offseasonOnly: true });
  });

  it("in the offseason, any of them can", () => {
    expect(isOffseason("2026-07-15", CAL)).toBe(true);
    expect(isOffseason("2026-10-19", CAL)).toBe(true);
    expect(isOffseason("2026-10-20", CAL)).toBe(false);
    expect(isOffseason("2027-05-01", CAL)).toBe(false);
    expect(veteranExtensionOpenOn("2026-10-19", "2029-30", CAL)).toEqual({ open: true, offseasonOnly: true });
    expect(veteranExtensionOpenOn("2026-10-20", "2029-30", CAL)).toEqual({ open: false, offseasonOnly: true });
  });
});

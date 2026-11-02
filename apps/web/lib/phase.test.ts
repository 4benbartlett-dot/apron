import { describe, it, expect } from "vitest";
import { homeHeadline, TAGLINE } from "@/lib/phase";
import { TRADE_DEADLINE } from "@/lib/league";

// The homepage headline follows the league year; the brand line doesn't.
// "The NBA offseason, simplified." sat on the homepage into November.
describe("the homepage headline follows the calendar", () => {
  it("is the offseason board through September", () => {
    expect(homeHeadline("2026-07-15").lead).toBe("The NBA offseason,");
    expect(homeHeadline("2026-09-30").sub).toBe("");
  });

  it("is trade season from camp to the deadline, counting down", () => {
    const h = homeHeadline("2026-11-02");
    expect(`${h.lead} ${h.emph}.`).toBe("Trade season, simplified.");
    expect(h.sub).toMatch(/^101 days to the Feb\. 11 trade deadline/);
    expect(homeHeadline("2027-02-10").sub).toMatch(/^1 day to/);
    expect(homeHeadline(TRADE_DEADLINE).sub).toBe("The trade deadline is today, at 3 p.m. ET.");
    // Offseason verbs are gone once the season is on.
    expect(h.intro).not.toMatch(/renounce/);
  });

  it("is the stretch run after the deadline, and the draft after the season", () => {
    expect(homeHeadline("2027-02-12").lead).toBe("The stretch run,");
    expect(homeHeadline("2027-04-11").lead).toBe("The stretch run,");
    expect(homeHeadline("2027-05-20").lead).toBe("The draft,");
  });

  it("keeps the same last word in every season, and a tagline with no season in it", () => {
    for (const d of ["2026-08-01", "2026-12-01", "2027-03-01", "2027-06-01"]) expect(homeHeadline(d).emph).toBe("simplified");
    expect(TAGLINE).not.toMatch(/offseason|season|deadline|draft/i);
  });

  it("uses the deadline the trade board uses", () => {
    expect(homeHeadline(TRADE_DEADLINE).lead).toBe("Trade season,");
    expect(homeHeadline(TRADE_DEADLINE.replace(/11$/, "12")).lead).toBe("The stretch run,");
  });
});

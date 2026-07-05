import { describe, it, expect } from "vitest";
import { violatesStepien } from "@apron/cba-engine";
import { FIRST_ENCUMBRANCES, PICK_LEDGER_TEAMS, firstEncumbranceOf } from "@apron/data";
import { lockedFirstEncumbrance, PICK_YEARS } from "@/lib/store";
import { summarizeTrade, encodeTradeParam } from "@/lib/trade-share";

// Reported by @npb666 on launch day: the sim let GSW trade 2027 + 2031 firsts
// even though GSW's 2030 first is already owed (protected 1-20) to Dallas —
// leaving a potential 2030+2031 consecutive gap. Permanent tests.

describe("real-world pick encumbrances (RealGM ledger)", () => {
  it("GSW's only encumbered first is 2030 — protected-out", () => {
    expect(Object.keys(FIRST_ENCUMBRANCES.GSW ?? {})).toEqual(["2030"]);
    const enc = firstEncumbranceOf("GSW", 2030)!;
    expect(enc.status).toBe("protected");
    // Counterparty churns with the live ledger (WAS → DAL → MEM so far) —
    // assert presence, not identity.
    expect(enc.counterparty.length).toBeGreaterThan(2);
  });

  it("swaps do NOT lock a pick (the team still drafts a first that year)", () => {
    // DAL 2028 is an OKC swap: still Dallas's pick to keep or (carefully) deal.
    expect(firstEncumbranceOf("DAL", 2028)?.status).toBe("swap");
    expect(lockedFirstEncumbrance("DAL", 2028)).toBeUndefined();
  });

  it("owed/protected firsts ARE locked", () => {
    expect(lockedFirstEncumbrance("GSW", 2030)?.status).toBe("protected");
  });

  it("duplicate (team, year) rows merge to the most restrictive read", () => {
    // MIN 2029 appears twice in the scrape (obligation chain + swap leg).
    expect(firstEncumbranceOf("MIN", 2029)?.status).toBe("protected");
  });

  it("the scrape covers most of the league; absent teams are known-unknown", () => {
    expect(PICK_LEDGER_TEAMS.length).toBeGreaterThanOrEqual(29);
  });

  it("a third team's swap right doesn't unlock an outright obligation", () => {
    // DAL and PHX 2029 firsts convey to HOU/BKN in every scenario — the only
    // "right to swap" in the chain is Houston's. Caught by adversarial review.
    expect(firstEncumbranceOf("DAL", 2029)?.status).not.toBe("swap");
    expect(lockedFirstEncumbrance("DAL", 2029)).toBeDefined();
    expect(firstEncumbranceOf("PHX", 2029)?.status).not.toBe("swap");
    expect(lockedFirstEncumbrance("PHX", 2029)).toBeDefined();
  });

  it("PHI 2028 is covered by the curated patch despite the scrape gap", () => {
    expect(firstEncumbranceOf("PHI", 2028)?.status).toBe("protected");
  });
});

describe("Stepien with real obligations", () => {
  const uncoveredAfterTrading = (team: string, tradedYears: number[]) =>
    PICK_YEARS.filter(
      (y) => tradedYears.includes(y) || lockedFirstEncumbrance(team, y) !== undefined,
    );

  it("GSW trading its 2031 first violates Stepien (2030 already can't be counted)", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2031]))).toBe(true);
  });

  it("GSW trading its 2029 first violates Stepien too (2029+2030)", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2029]))).toBe(true);
  });

  it("GSW trading 2027 alone stays legal", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2027]))).toBe(false);
  });

  it("the launch-day card (2027 + 2031 out) is now blocked", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2027, 2031]))).toBe(true);
  });

  it("share cards / OG images agree — a Stepien-illegal pick share reads blocked", () => {
    const token = encodeTradeParam(
      ["BOS", "GSW"],
      [],
      [
        { id: "GSW|2027|1", from: "GSW", to: "BOS" },
        { id: "GSW|2031|1", from: "GSW", to: "BOS" },
      ],
    );
    const s = summarizeTrade(token)!;
    expect(s.legal).toBe(false);
    expect(s.reason).toMatch(/Stepien/);
  });
});

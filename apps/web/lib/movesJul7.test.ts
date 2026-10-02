import { describe, it, expect } from "vitest";
import { spendingPower } from "@apron/cba-engine";
import { BASE_CONTRACTS, C, currentSalary, feedStateOf, consumedFor } from "@/lib/league";

// The Jul 7 wave: extensions, re-signs, and outside signings all book once with
// their filed terms, and the one new real hard cap (SAC) is seeded.

const active = (n: string) => {
  const rows = BASE_CONTRACTS.filter((c) => c.playerName === n && !c.deadMoney);
  expect(rows.length, `${n} should appear exactly once`).toBe(1);
  return rows[0]!;
};

describe("Jul 7 signings & extensions book correctly", () => {
  it("the big new deals land on the right teams with 2026-27 salary", () => {
    // Extensions add years without wiping the current season.
    expect(currentSalary(active("Donovan Mitchell"))).toBeGreaterThan(45_000_000); // CLE max
    expect(active("Donovan Mitchell").teamId).toBe("CLE");
    // Re-signs and outside deals.
    expect(active("Isaiah Hartenstein").teamId).toBe("OKC");
    expect(active("Collin Gillespie").teamId).toBe("PHX");
    expect(active("Mark Williams").teamId).toBe("PHX");
    expect(active("Al Horford").teamId).toBe("GSW");
    expect(active("Landry Shamet").teamId).toBe("NYK");
    expect(active("Precious Achiuwa").teamId).toBe("SAC");
    expect(active("Kevon Looney").teamId).toBe("LAL");
  });

  it("no player from the wave is duplicated", () => {
    for (const n of ["Donovan Mitchell", "Isaiah Hartenstein", "Collin Gillespie", "Mark Williams", "Al Horford", "Landry Shamet", "Precious Achiuwa"]) {
      expect(BASE_CONTRACTS.filter((c) => c.playerName === n && !c.deadMoney)).toHaveLength(1);
    }
  });
});

describe("SAC's Achiuwa NT-MLE (corrected from a Bird misread)", () => {
  it("hard-caps Sacramento at the first apron — the 14th capped team", () => {
    // Oct 2 2026: the exception was the BI-ANNUAL, not the mid-level. His
    // filed first year is $5,477,000, the bi-annual to the dollar; the
    // $5,609,756 that pointed at the mid-level was a back-solve of the
    // reported total. The hard cap is the same — the bi-annual triggers it.
    const s = feedStateOf("SAC");
    expect(s.consumed.bae).toBe(C.biAnnualException);
    expect(s.consumed.ntmle).toBeUndefined();
    expect(s.hardCap).toBe(C.firstApron);
    expect(s.hardCapSource).toContain("Achiuwa");
    const power = spendingPower(190_000_000, C, {
      apronSalary: 190_000_000,
      consumed: consumedFor([], "SAC"),
    });
    const nt = power.mechanisms.find((m) => m.id === "ntmle");
    expect(nt?.maxSalary).toBe(C.nonTaxpayerMLE);
    expect(power.mechanisms.find((m) => m.id === "bae")).toBeUndefined();
  });
});

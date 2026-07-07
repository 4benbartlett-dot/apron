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
    const s = feedStateOf("SAC");
    expect(s.consumed.ntmle).toBe(5_609_756);
    expect(s.hardCap).toBe(C.firstApron);
    expect(s.hardCapSource).toContain("Achiuwa");
    // The NT-MLE now shows its used remainder, not the full exception.
    const power = spendingPower(190_000_000, C, {
      apronSalary: 190_000_000,
      consumed: consumedFor([], "SAC"),
    });
    const nt = power.mechanisms.find((m) => m.id === "ntmle");
    expect(nt?.maxSalary).toBe(C.nonTaxpayerMLE - 5_609_756);
  });
});

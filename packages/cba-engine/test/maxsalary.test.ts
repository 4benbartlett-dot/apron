import { describe, it, expect } from "vitest";
import { validateSigning, maxSalaryTier, reSignMax } from "../src/index";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";

describe("max salary tiers by years of service", () => {
  it("0-6 YOS => 25%, 7-9 => 30%, 10+ => 35%", () => {
    expect(maxSalaryTier(3, C)).toBe(C.maxSalary["0-6"]);
    expect(maxSalaryTier(8, C)).toBe(C.maxSalary["7-9"]);
    expect(maxSalaryTier(12, C)).toBe(C.maxSalary["10+"]);
  });
});

describe("re-signing ceilings by Bird sub-type", () => {
  it("Non-Bird uses 120% of prior when that beats the minimum floor", () => {
    // $10M prior, 3 YOS: 120% prior = $12M >> 120% of the 3-yr min ($2.85M).
    expect(reSignMax("non_bird", 10_000_000, 3, C)).toBe(12_000_000);
  });
  it("Non-Bird floors at 120% of the applicable minimum for low-prior players", () => {
    // $2M prior, 3 YOS: 120% prior = $2.4M, but 120% of the 3-yr min
    // ($2,378,870) = $2,854,644 governs.
    expect(reSignMax("non_bird", 2_000_000, 3, C)).toBe(
      C.minimumSalaries[3]! * 1.2,
    );
  });
  it("Bird allows up to the YOS tier max", () => {
    expect(reSignMax("bird", 2_000_000, 3, C)).toBe(C.maxSalary["0-6"]);
  });
});

describe("validateSigning enforces the player's maximum (the fixed Bird bug)", () => {
  it("ILLEGAL: a $2M Non-Bird own free agent cannot sign for $40M", () => {
    const v = validateSigning(200_000_000, 40_000_000, C, {
      isOwnFreeAgent: true,
      birdStatus: "non_bird",
      priorSalary: 2_000_000,
      yearsOfService: 3,
    });
    expect(v.legal).toBe(false);
    // Ceiling is the Non-Bird re-sign max = greater of 120% prior or 120% of
    // the 3-yr minimum ($2,854,644).
    expect(v.maxOffer).toBeLessThanOrEqual(C.minimumSalaries[3]! * 1.2 + 1);
  });

  it("ILLEGAL: an outside signing above the 0-6 YOS max (25%) is rejected", () => {
    // Under-cap team with room, but the player is a 3-year vet -> 25% max.
    const v = validateSigning(120_000_000, 45_000_000, C, { yearsOfService: 3 });
    expect(v.legal).toBe(false);
    expect(v.maxOffer).toBeLessThanOrEqual(C.maxSalary["0-6"] + 1);
  });

  it("LEGAL: a full-Bird 10-year vet re-signs at the 35% max", () => {
    const v = validateSigning(200_000_000, C.maxSalary["10+"], C, {
      isOwnFreeAgent: true,
      birdStatus: "bird",
      priorSalary: 40_000_000,
      yearsOfService: 12,
    });
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("bird");
  });

  it("backward-compatible: with no YOS/prior, own FA defaults to the tier max", () => {
    const v = validateSigning(200_000_000, 40_000_000, C, { isOwnFreeAgent: true });
    expect(v.legal).toBe(true);
  });
});

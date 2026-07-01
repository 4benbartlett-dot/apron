import { describe, it, expect } from "vitest";
import {
  veteranExtensionMax,
  extendAndTradeMax,
  renegotiationMax,
} from "../src/index";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";

describe("veteran extension first-year ceiling (140% rule)", () => {
  it("uses 140% of prior salary when that beats 140% of the estimated average", () => {
    // $30M prior, 8 YOS: 140% prior = $42M; 140% est-avg ($12.4M) = $17.36M.
    // Player max (7-9 tier = $46.39M) does not bind, so $42M governs.
    expect(veteranExtensionMax(30_000_000, 8, C)).toBe(42_000_000);
  });
  it("floors low-prior players at 140% of the estimated average salary", () => {
    // $5M prior: 140% prior = $7M; 140% est-avg = $17.36M governs.
    expect(veteranExtensionMax(5_000_000, 8, C)).toBe(C.estimatedAverageSalary * 1.4);
  });
  it("never exceeds the player's maximum", () => {
    // $40M prior, 3 YOS: 140% = $56M, but 0-6 tier max ($38.66M) caps it.
    expect(veteranExtensionMax(40_000_000, 3, C)).toBe(
      Math.max(C.maxSalary["0-6"], 40_000_000 * 1.05),
    );
  });
});

describe("extend-and-trade first-year ceiling (120% rule)", () => {
  it("uses the greater of 120% of prior or 120% of the estimated average", () => {
    expect(extendAndTradeMax(30_000_000, 8, C)).toBe(36_000_000); // 120% of $30M
    expect(extendAndTradeMax(5_000_000, 8, C)).toBe(C.estimatedAverageSalary * 1.2);
  });
});

describe("renegotiation (under-cap only, raise limited to Room)", () => {
  it("raises the salary by the team's cap Room, capped at the max", () => {
    // committed $130M, cap $154.647M -> Room $24.647M; $20M current + Room.
    expect(renegotiationMax(130_000_000, 20_000_000, 8, C)).toBe(
      20_000_000 + (C.salaryCap - 130_000_000),
    );
  });
  it("is not permitted for an over-cap team (salary unchanged)", () => {
    expect(renegotiationMax(160_000_000, 20_000_000, 8, C)).toBe(20_000_000);
  });
});

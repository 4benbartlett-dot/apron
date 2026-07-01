import { describe, it, expect } from "vitest";
import { stretchProvision } from "../src/index";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";

describe("stretch provision (2N+1 spread, 15%-of-cap guardrail)", () => {
  it("spreads remaining salary over twice the seasons plus one", () => {
    const r = stretchProvision(30_000_000, 2, C); // 2*2+1 = 5 years
    expect(r.years).toBe(5);
    expect(r.perYear).toBe(6_000_000);
    expect(r.legal).toBe(true);
  });
  it("flags a stretch whose per-year hit would exceed 15% of the cap", () => {
    // $100M over 1 remaining season -> 3 years -> $33.3M/yr > 15% of cap ($23.2M).
    const r = stretchProvision(100_000_000, 1, C);
    expect(r.years).toBe(3);
    expect(r.legal).toBe(false);
  });
});

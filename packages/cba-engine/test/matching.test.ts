import { describe, it, expect } from "vitest";
import { maxIncomingSalary } from "../src/matching";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";

describe("expanded traded-player matching (team below the first apron)", () => {
  it("tier 1: outgoing ≤ $7.5M → 200% + $250k", () => {
    expect(maxIncomingSalary(5_000_000, "over_cap", 0, C).maxIncoming).toBe(
      10_250_000,
    );
  });

  it("tier 1 boundary: exactly $7.5M out", () => {
    const r = maxIncomingSalary(7_500_000, "over_cap", 0, C);
    expect(r.maxIncoming).toBe(15_250_000);
    expect(r.rule).toBe("expanded_tier1_200pct");
  });

  it("tier 2: $7.5M–$29M out → outgoing + $7.5M flat", () => {
    const r = maxIncomingSalary(10_000_000, "taxpayer", 0, C);
    expect(r.maxIncoming).toBe(17_500_000);
    expect(r.rule).toBe("expanded_tier2_flat");
  });

  it("tier 3: outgoing > $29M → 125% + $250k", () => {
    const r = maxIncomingSalary(35_000_000, "over_cap", 0, C);
    expect(r.maxIncoming).toBe(44_000_000);
    expect(r.rule).toBe("expanded_tier3_125pct");
  });
});

describe("apron teams are limited to 100% (no 110%, no expanded bands)", () => {
  it("first-apron team: dollar-for-dollar", () => {
    const r = maxIncomingSalary(20_000_000, "first_apron", 0, C);
    expect(r.maxIncoming).toBe(20_000_000);
    expect(r.rule).toBe("first_apron_100pct");
  });

  it("second-apron team: dollar-for-dollar", () => {
    const r = maxIncomingSalary(20_000_000, "second_apron", 0, C);
    expect(r.maxIncoming).toBe(20_000_000);
    expect(r.rule).toBe("second_apron_100pct");
  });

  it("a $40M-out first-apron team still cannot exceed 100%", () => {
    // The old-CBA 150% rule and the dead 2023-24 110% rule must NOT apply.
    expect(maxIncomingSalary(40_000_000, "first_apron", 0, C).maxIncoming).toBe(
      40_000_000,
    );
  });
});

describe("under-cap teams absorb into cap room", () => {
  it("takes back outgoing + room + $250k (2023-CBA room allowance, finish <= cap + $250k)", () => {
    const r = maxIncomingSalary(5_000_000, "below_cap", 12_000_000, C);
    expect(r.maxIncoming).toBe(17_250_000);
    expect(r.rule).toBe("cap_room_absorption");
  });

  it("falls back to standard matching if that allows more than room + $250k", () => {
    // $2M room, $30M out: absorption = 30 + 2 + 0.25 = 32.25M; tier-3 matching =
    // 1.25*30 + 0.25 = 37.75M, which is larger.
    const r = maxIncomingSalary(30_000_000, "below_cap", 2_000_000, C);
    expect(r.maxIncoming).toBe(37_750_000);
    expect(r.rule).toBe("expanded_tier3_125pct");
  });
});

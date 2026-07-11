import { describe, it, expect } from "vitest";
import { isExtensionEligible } from "@/lib/league";
import { DATA_AS_OF } from "@apron/data";

// SIM_TODAY tracks the roster snapshot, so extension windows that opened by the
// data's date are honored and can never go stale relative to what we display.
describe("extension eligibility tracks the data snapshot", () => {
  it("snapshot is 2026-07-09 (guards the dates below)", () => {
    expect(DATA_AS_OF).toBe("2026-07-09");
  });
  it("windows that opened by the snapshot are eligible", () => {
    // all opened 7/9/2026 — on or before the 7/9 snapshot
    expect(isExtensionEligible("Derrick Jones Jr.")).toBe(true);
    expect(isExtensionEligible("Jerami Grant")).toBe(true);
    expect(isExtensionEligible("Dejounte Murray")).toBe(true);
  });
  it("windows that open AFTER the snapshot are not yet eligible", () => {
    // Saddiq Bey opens 7/10/2026 — one day past the 7/9 snapshot
    expect(isExtensionEligible("Saddiq Bey")).toBe(false);
    // Tre Jones opens 7/6/2027 — well past
    expect(isExtensionEligible("Tre Jones")).toBe(false);
  });
});

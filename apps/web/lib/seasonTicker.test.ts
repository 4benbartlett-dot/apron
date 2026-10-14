import { describe, it, expect } from "vitest";
import { seasonPhase } from "@/components/SeasonTicker";

// The header read "free agency · day 107" on Oct 14: it only knew one phase.
describe("the header's season clock", () => {
  const at = (iso: string) => new Date(iso).getTime();
  it("counts free agency through September", () => {
    expect(seasonPhase(at("2026-07-01T12:00:00-04:00"))).toBe("free agency · day 1");
    expect(seasonPhase(at("2026-09-30T12:00:00-04:00"))).toMatch(/^free agency · day \d+$/);
  });
  it("counts down to opening night in camp", () => {
    expect(seasonPhase(at("2026-10-14T12:00:00-04:00"))).toBe("training camp · 6 days to opening night");
    expect(seasonPhase(at("2026-10-19T12:00:00-04:00"))).toBe("opening night is tomorrow");
  });
  it("counts the regular season from opening night", () => {
    expect(seasonPhase(at("2026-10-20T20:00:00-04:00"))).toBe("regular season · day 1");
  });
});

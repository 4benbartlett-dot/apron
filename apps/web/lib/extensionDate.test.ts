import { describe, it, expect } from "vitest";
import { isExtensionEligible } from "@/lib/league";
import { DATA_AS_OF } from "@apron/data";

// SIM_TODAY tracks the roster snapshot, so an extension window that has opened
// by the data's date is honored — and this test asserts that RELATIONSHIP
// against DATA_AS_OF dynamically, so it never goes stale when the data
// advances (it doesn't pin a literal date).
const asOf = () => {
  const [y, m, d] = DATA_AS_OF.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const opensOnOrBefore = (mdy: string) => {
  const [m, d, y] = mdy.split("/").map(Number);
  return new Date(y!, m! - 1, d!).getTime() <= asOf().getTime();
};

describe("extension eligibility tracks the data snapshot", () => {
  it("a window on/before the snapshot is eligible; one after is not", () => {
    // Windows and their real open dates (extension-eligible.json). Each
    // assertion is derived from DATA_AS_OF, so it holds at any snapshot.
    const cases: [string, string][] = [
      ["Derrick Jones Jr.", "7/9/2026"],
      ["Jerami Grant", "7/9/2026"],
      ["Dejounte Murray", "7/9/2026"],
      ["Saddiq Bey", "7/10/2026"],
      ["Tre Jones", "7/6/2027"], // far future — never eligible at a 2026 snapshot
    ];
    for (const [name, opens] of cases) {
      expect(isExtensionEligible(name), `${name} (opens ${opens})`).toBe(opensOnOrBefore(opens));
    }
  });
});

import { describe, it, expect } from "vitest";
import { C, stepienFindingFor, hardCapDetailFor, feedStateOf } from "@/lib/league";

// Structured rule findings — born from launch-week feedback that "Stepien
// rule" and "hard-capped from an earlier move" were too vague to act on.
// The message must name the ACTUAL picks and the ACTUAL cap source.

describe("stepienFindingFor", () => {
  it("names the real encumbered year AND the offending outgoing pick (the GSW case)", () => {
    // GSW's 2030 first is already owed (protected) in the real world; the user
    // adds the 2031 first to a deal. The bad pick is 2031 — NOT whatever year
    // happens to sort first.
    const f = stepienFindingFor("GSW", [2030, 2031], [2031]);
    expect(f).not.toBeNull();
    expect(f!.pair).toEqual([2030, 2031]);
    expect(f!.offendingYear).toBe(2031);
    expect(f!.encumbered.some((e) => e.year === 2030)).toBe(true);
    expect(f!.message).toContain("2030 first is already owed");
    expect(f!.message).toContain("trading the 2031 first");
    expect(f!.message).not.toContain("would be without a first-round pick in consecutive"); // no vague fallback
  });

  it("falls back to a plain consecutive-years message when nothing is encumbered", () => {
    // CHA has no real 2028/29 obligations, so both uncovered years are the
    // user's own doing — the message should just name the consecutive pair.
    const f = stepienFindingFor("CHA", [2028, 2029], [2028, 2029]);
    expect(f).not.toBeNull();
    expect(f!.encumbered).toHaveLength(0);
    expect(f!.message).toContain("2028");
    expect(f!.message).toContain("2029");
  });

  it("returns null when the uncovered years are not consecutive", () => {
    expect(stepienFindingFor("CHA", [2027, 2029, 2031], [2027])).toBeNull();
  });
});

describe("hardCapDetailFor (session vs real-July provenance)", () => {
  it("a feed-capped team reports source=real with the named move", () => {
    const d = hardCapDetailFor("IND", Infinity);
    expect(d).toEqual({ line: C.firstApron, source: "real", label: feedStateOf("IND").hardCapSource });
    expect(d!.label).toContain("Oubre");
  });

  // GSW's cap was re-read on Jul 28: Melton's deal is the taxpayer MLE, not the
  // BAE, so the line is the SECOND apron rather than the first (see
  // feedState.test.ts). Still a real, named, feed-derived cap.
  it("GSW's Melton cap is the second apron, not the first", () => {
    const d = hardCapDetailFor("GSW", Infinity);
    expect(d).toEqual({ line: C.secondApron, source: "real", label: feedStateOf("GSW").hardCapSource });
    expect(d!.label).toContain("Melton");
  });

  it("a session-only cap reports source=session (undoable)", () => {
    expect(hardCapDetailFor("CHA", C.firstApron)).toEqual({ line: C.firstApron, source: "session" });
  });

  it("uncapped teams return null", () => {
    expect(hardCapDetailFor("CHA", Infinity)).toBeNull();
  });

  it("when both bind at the same line, reality wins the label", () => {
    const d = hardCapDetailFor("LAL", C.firstApron);
    expect(d!.source).toBe("real");
    expect(d!.label).toContain("Kessler");
  });
});

import { describe, it, expect } from "vitest";
import { violatesStepien } from "@apron/cba-engine";
import { FIRST_ENCUMBRANCES, PICK_LEDGER_TEAMS, firstEncumbranceOf, ACQUIRED_PICKS, PICK_RIGHTS } from "@apron/data";
import { lockedFirstEncumbrance, PICK_YEARS } from "@/lib/store";
import { summarizeTrade, encodeTradeParam } from "@/lib/trade-share";

// Reported by @npb666 on launch day: the sim let GSW trade 2027 + 2031 firsts
// even though GSW's 2030 first is already owed (protected 1-20) to Dallas —
// leaving a potential 2030+2031 consecutive gap. Permanent tests.

describe("real-world pick encumbrances (RealGM ledger)", () => {
  it("GSW's only encumbered first is 2030 — protected-out", () => {
    expect(Object.keys(FIRST_ENCUMBRANCES.GSW ?? {})).toEqual(["2030"]);
    const enc = firstEncumbranceOf("GSW", 2030)!;
    expect(enc.status).toBe("protected");
    // Counterparty churns with the live ledger (WAS → DAL → MEM so far) —
    // assert presence, not identity.
    expect(enc.counterparty.length).toBeGreaterThan(2);
  });

  it("swaps do NOT lock a pick (the team still drafts a first that year)", () => {
    // DAL 2028 is an OKC swap: still Dallas's pick to keep or (carefully) deal.
    expect(firstEncumbranceOf("DAL", 2028)?.status).toBe("swap");
    expect(lockedFirstEncumbrance("DAL", 2028)).toBeUndefined();
  });

  it("owed/protected firsts ARE locked", () => {
    expect(lockedFirstEncumbrance("GSW", 2030)?.status).toBe("protected");
  });

  it("duplicate (team, year) rows merge to the most restrictive read", () => {
    // MIN 2029 appears twice in the scrape (obligation chain + swap leg).
    expect(firstEncumbranceOf("MIN", 2029)?.status).toBe("protected");
  });

  it("the scrape covers most of the league; absent teams are known-unknown", () => {
    expect(PICK_LEDGER_TEAMS.length).toBeGreaterThanOrEqual(29);
  });

  it("a third team's swap right doesn't unlock an outright obligation", () => {
    // DAL and PHX 2029 firsts convey to HOU/BKN in every scenario — the only
    // "right to swap" in the chain is Houston's. Caught by adversarial review.
    expect(firstEncumbranceOf("DAL", 2029)?.status).not.toBe("swap");
    expect(lockedFirstEncumbrance("DAL", 2029)).toBeDefined();
    expect(firstEncumbranceOf("PHX", 2029)?.status).not.toBe("swap");
    expect(lockedFirstEncumbrance("PHX", 2029)).toBeDefined();
  });

  it("PHI 2028 is encumbered (scraper fixed; curated patch is the fallback)", () => {
    expect(lockedFirstEncumbrance("PHI", 2028)).toBeDefined();
    expect(PICK_LEDGER_TEAMS.length).toBe(30);
  });
});

describe("Stepien with real obligations", () => {
  const uncoveredAfterTrading = (team: string, tradedYears: number[]) =>
    PICK_YEARS.filter(
      (y) => tradedYears.includes(y) || lockedFirstEncumbrance(team, y) !== undefined,
    );

  it("GSW trading its 2031 first violates Stepien (2030 already can't be counted)", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2031]))).toBe(true);
  });

  it("GSW trading its 2029 first violates Stepien too (2029+2030)", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2029]))).toBe(true);
  });

  it("GSW trading 2027 alone stays legal", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2027]))).toBe(false);
  });

  it("the launch-day card (2027 + 2031 out) is now blocked", () => {
    expect(violatesStepien(uncoveredAfterTrading("GSW", [2027, 2031]))).toBe(true);
  });

  it("share cards / OG images agree — a Stepien-illegal pick share reads blocked", () => {
    const token = encodeTradeParam(
      ["BOS", "GSW"],
      [],
      [
        { id: "GSW|2027|1", from: "GSW", to: "BOS" },
        { id: "GSW|2031|1", from: "GSW", to: "BOS" },
      ],
    );
    const s = summarizeTrade(token)!;
    expect(s.legal).toBe(false);
    expect(s.reason).toMatch(/Stepien/);
  });
});

describe("acquired incoming picks (real trades before the sim)", () => {
  it("derives clean acquired picks into structured inventory, no double-owns", () => {
    expect(ACQUIRED_PICKS.length).toBeGreaterThan(50);
    const ids = ACQUIRED_PICKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // a pick can't be owned twice
    for (const p of ACQUIRED_PICKS) {
      expect(p.id).toBe(`${p.origin}|${p.year}|${p.round}`);
      expect(p.origin).not.toBe(p.team); // acquired = someone else's pick
      expect(p.year).toBeGreaterThanOrEqual(2027);
      expect(p.year).toBeLessThanOrEqual(2032);
    }
  });

  it("clean outright holdings are inventory (BKN owns NYK's 2029, MEM owns ORL's 2030)", () => {
    expect(ACQUIRED_PICKS.find((p) => p.id === "NYK|2029|1")?.team).toBe("BKN");
    expect(ACQUIRED_PICKS.find((p) => p.id === "ORL|2030|1")?.team).toBe("MEM");
  });

  it("conditional/protected picks are NOT inventory, even when only the detail says so", () => {
    // The headline-regex builder missed conditions living in the detail text:
    // the board sold these as clean while team pages called them conditional.
    const ids = new Set(ACQUIRED_PICKS.map((p) => p.id));
    expect(ids.has("DEN|2027|1")).toBe(false); // → OKC only outside prot 1-5, rolls to 2029
    expect(ids.has("SAS|2027|1")).toBe(false); // → OKC only if it lands 17-30
    expect(ids.has("DEN|2029|1")).toBe(false); // → OKC only after a first conveys
    expect(ids.has("GSW|2030|1")).toBe(false); // → MEM protected 1-20
    expect(ids.has("LAL|2027|1")).toBe(false); // → MEM protected 1-4
    expect(ids.has("PHI|2028|1")).toBe(false); // → BOS or instead a swap right
    expect(ids.has("DAL|2027|1")).toBe(false); // → CHA protected 1-2
    expect(ids.has("MIA|2027|1")).toBe(false); // → CHA protected 1-14, rolls to 2028
    expect(ids.has("HOU|2029|1")).toBe(false); // → BKN least favorable of HOU/DAL/PHX
    expect(ids.has("LAL|2027|2")).toBe(false); // → BKN only if LAL's first conveys to MEM
    expect(ids.has("MIN|2029|2")).toBe(false); // → CHA only if MIN's first conveys to UTA
  });

  it("every acquired pick traces to an outright, unconditional PICK_RIGHTS holding", () => {
    // ACQUIRED_PICKS ⊆ pick-rights outright holdings — one source of truth, so
    // the board's inventory can never drift from what the team pages label.
    for (const p of ACQUIRED_PICKS) {
      const h = (PICK_RIGHTS[p.team]?.holdings ?? []).find(
        (h) =>
          h.kind === "outright" && h.origin === p.origin &&
          h.year === p.year && h.round === p.round,
      );
      expect(h, `${p.id} held by ${p.team} has no outright pick-rights holding`).toBeDefined();
      expect(h!.protection, `${p.id} carries a protection band`).toBeUndefined();
      expect(h!.favorable, `${p.id} carries a favorability condition`).toBeUndefined();
    }
  });

  it("never lists a pick a team already owes away as also acquired", () => {
    // If OKC owns DEN's 2027 first, DEN's own-first encumbrance must agree it's gone.
    for (const p of ACQUIRED_PICKS) {
      if (p.round !== 1) continue;
      const enc = firstEncumbranceOf(p.origin, p.year);
      // origin either has an encumbrance on that first, or it's simply conveyed —
      // in no case should the origin still be free to trade it AND OKC own it.
      // (We only assert consistency where the ledger records the origin side.)
      if (enc) expect(["owed", "protected", "swap"]).toContain(enc.status);
    }
  });
});

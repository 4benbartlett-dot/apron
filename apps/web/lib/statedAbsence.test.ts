import { describe, it, expect } from "vitest";
import { parseAbsence, injuryOf, BASE_CONTRACTS, normName } from "@/lib/league";
import { hardCapCause } from "@/lib/format";

// ---------------------------------------------------------------------------
// OFFSEASON INJURIES, read off the wire.
//
// The Basketball-Reference report we scrape is a snapshot of the season just
// ended, so an August injury is invisible to it — Shaedon Sharpe tore a meniscus
// on Aug 24 and kept projecting as a healthy 82-game starter. The transaction
// feed carries it in prose instead, and prose is the one input here nobody
// controls, so the parser is pinned to the shapes it has to survive.
// ---------------------------------------------------------------------------

describe("reading an absence off the wire", () => {
  it("reads the live row that started this", () => {
    expect(
      parseAbsence("Expected to miss six months with Portland (POR) due to knee (torn meniscus) injury"),
    ).toEqual({ months: 6, desc: "knee (torn meniscus)" });
  });

  it("takes the UPPER end of a range", () => {
    // Teams sit players past the optimistic number. Reading "4-6 weeks" as four
    // is the error that puts a rehabbing starter back on opening night.
    expect(parseAbsence("Expected to miss 4-6 weeks due to ankle sprain")?.months).toBeCloseTo(6 / 4.345, 5);
    expect(parseAbsence("Expected to miss 3 to 4 months due to foot surgery")?.months).toBe(4);
    expect(parseAbsence("Expected to miss two-three weeks due to a calf strain")?.months).toBeCloseTo(3 / 4.345, 5);
  });

  it("converts weeks to months, and digits and words alike", () => {
    expect(parseAbsence("Expected to miss 12 weeks due to wrist")?.months).toBeCloseTo(12 / 4.345, 5);
    expect(parseAbsence("Expected to miss eight months due to Achilles")?.months).toBe(8);
    expect(parseAbsence("Expected to miss approximately 5 months due to knee")?.months).toBe(5);
  });

  it("treats a season-long absence as a season", () => {
    for (const s of [
      "Expected to miss the season with Portland (POR) due to knee injury",
      "Expected to miss the rest of the season due to a torn ACL",
    ])
      expect(parseAbsence(s)?.months).toBe(12);
  });

  it("returns null rather than throwing on anything else", () => {
    for (const s of [
      "",
      "Waived by Dallas Mavericks (DAL) via Buyout",
      "Expected to miss",
      "Expected to miss several months due to vibes",
      "Expected to miss 0 months due to nothing",
      "Agreed to a 3 year $97 million contract with Cleveland Cavaliers (CLE)",
    ]) {
      expect(() => parseAbsence(s)).not.toThrow();
      expect(parseAbsence(s)).toBeNull();
    }
  });

  it("puts Sharpe's August meniscus on the sheet the scrape can't see", () => {
    const c = BASE_CONTRACTS.find((x) => normName(x.playerName) === normName("Shaedon Sharpe"))!;
    const inj = injuryOf(c.playerId)!;
    expect(inj.status).toBe("out");
    expect(inj.desc).toContain("torn meniscus");
    expect(inj.team).toBe("POR");
  });
});

// ---------------------------------------------------------------------------
// PUBLIC COPY. feed-team-state stores hard-cap causes as compact internal
// labels, and they were being printed raw onto team pages and search results:
// "hard cap from De'Anthony Melton Taxpayer MLE" reads like two database
// columns stuck together, and "NT-MLE" is an acronym a reader cannot expand.
// ---------------------------------------------------------------------------

describe("naming a hard cap's cause in English", () => {
  it("expands the acronyms and makes the name possessive", () => {
    expect(hardCapCause("Rui Hachimura NT-MLE")).toBe("Rui Hachimura’s non-taxpayer mid-level");
    expect(hardCapCause("De'Anthony Melton Taxpayer MLE")).toBe("De'Anthony Melton’s taxpayer mid-level");
  });

  it("drops the full/partial bookkeeping, which changes nothing for a reader", () => {
    expect(hardCapCause("Luke Kennard Taxpayer MLE (full)")).toBe("Luke Kennard’s taxpayer mid-level");
    expect(hardCapCause("Kelly Oubre Jr. NT-MLE (partial)")).toBe("Kelly Oubre Jr.’s non-taxpayer mid-level");
  });

  it("does not force a possessive onto two players sharing one exception", () => {
    expect(hardCapCause("Hayes + Okogie NT-MLE (split)")).toBe("the Hayes + Okogie non-taxpayer mid-level");
  });

  it("reads a sign-and-trade as the deal, not as a possession", () => {
    expect(hardCapCause("Peyton Watson sign-and-trade acquisition")).toBe("the Peyton Watson sign-and-trade");
    expect(hardCapCause("Khris Middleton sign-and-trade")).toBe("the Khris Middleton sign-and-trade");
  });

  it("passes anything it does not recognise through untouched", () => {
    expect(hardCapCause("a move you've staged this session")).toBe("a move you've staged this session");
    expect(hardCapCause(undefined)).toBeUndefined();
  });
});

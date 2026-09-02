import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_SCHEMAS, validateDataFile, validateContractRow, validateLeagueRulings, type SchemaId } from "@apron/data";
import { TEAM_IDS } from "@/lib/league";

// ---------------------------------------------------------------------------
// THE SCHEMAS. Every curated file the admin can write is validated on the way
// out; this pins that every file already on disk is valid on the way in, so a
// scraper or a hand edit that drifts from the types is caught here rather
// than on a page. The negative cases keep the validators honest.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, "..", "..", "..", "packages", "data", "src");
const ctx = { teams: new Set(TEAM_IDS) };

describe("every data file on disk validates against its schema", () => {
  for (const id of Object.keys(DATA_SCHEMAS) as SchemaId[]) {
    it(DATA_SCHEMAS[id].file, () => {
      const json = JSON.parse(readFileSync(join(SRC, DATA_SCHEMAS[id].file), "utf8"));
      const issues = validateDataFile(id, json, ctx);
      expect(issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
    });
  }
});

describe("the validators reject what the types would", () => {
  it("a contract row with a string salary, a bad team, and a stray field", () => {
    const issues = validateContractRow(
      { playerId: "x01", playerName: "X", teamId: "XXX", years: [{ leagueYear: "2026-27", salary: "12", guarantee: "maybe" }], bogus: 1 },
      "$",
      ctx,
    );
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("$.teamId");
    expect(paths).toContain("$.years[0].salary");
    expect(paths).toContain("$.years[0].guarantee");
    expect(paths).toContain("$.bogus");
  });

  it("a ruling with a forfeiture on a team that does not exist", () => {
    const issues = validateLeagueRulings(
      {
        rulings: [
          {
            id: "x", date: "2026-09-02", team: "LAC", headline: "long enough headline", summary: "s", findings: [],
            penalties: [{ kind: "pick_forfeiture", team: "LAC", year: 2030, round: 1, origin: "LAX", text: "text here" }],
            sources: [{ outlet: "o" }],
          },
        ],
      },
      ctx,
    );
    expect(issues.some((i) => i.path.endsWith(".origin"))).toBe(true);
  });

  it("a curated move needs its why", () => {
    const issues = validateDataFile("manualMoves", { transactions: [{ player: "P", pos: "G", date: "Sep 02, 2026", type: "Signing", detail: "Signed" }] }, ctx);
    expect(issues.some((i) => i.path.endsWith(".why"))).toBe(true);
  });
});

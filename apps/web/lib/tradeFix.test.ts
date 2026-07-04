import { describe, it, expect } from "vitest";
import { validateTrade, type Contract, type LeagueData } from "@apron/cba-engine";
import { C } from "@/lib/league";
import { explainBlocked } from "@/lib/tradeFix";

const c = (playerId: string, teamId: string, salary: number): Contract => ({
  playerId,
  playerName: playerId,
  teamId,
  years: [{ leagueYear: "2026-27", salary, guarantee: "full" }],
});

// TAX: a luxury-tax team (~$195M). APR2: a second-apron team (~$240M).
const data: LeagueData = {
  leagueYear: "2026-27",
  teams: [
    { id: "TAX", name: "TAX" },
    { id: "APR2", name: "APR2" },
    { id: "OTH", name: "OTH" },
  ],
  contracts: [
    c("tax-small", "TAX", 12_500_000),
    c("tax-fill", "TAX", 182_500_000),
    c("apr2-mid", "APR2", 19_500_000),
    c("apr2-low", "APR2", 7_500_000),
    c("apr2-fill", "APR2", 213_000_000),
    c("oth-star", "OTH", 27_000_000),
    c("oth-fill", "OTH", 140_000_000),
  ],
};

describe("explainBlocked", () => {
  it("taxpayer over its band: trim + add-outgoing routes, no bogus shed route", () => {
    // TAX sends $12.5M, takes back $27M — band is out+$7.5M = $20M, over by $7M.
    const v = validateTrade(
      data,
      {
        teams: ["TAX", "OTH"],
        players: [
          { playerId: "tax-small", from: "TAX", to: "OTH" },
          { playerId: "oth-star", from: "OTH", to: "TAX" },
        ],
      },
      C,
    );
    expect(v.legal).toBe(false);
    const e = explainBlocked(v, [], C);
    expect(e.subject.join(" ")).toMatch(/over the cap|luxury tax/);
    expect(e.fixes.join(" ")).toMatch(/take back \$7\.0M less/);
    // out+7.5 band: need $19.5M out → +$7.0M more.
    expect(e.fixes.join(" ")).toMatch(/Add roughly \$7\.0M more outgoing/);
    // Already below the first apron — a "shed to escape" route must NOT appear.
    expect(e.fixes.join(" ")).not.toMatch(/shed .* separate deal first/i);
  });

  it("second-apron team taking back more: 100% subject line + shed-to-escape route with the right band", () => {
    // APR2 (~$240M) sends $19.5M for $27M — 100% cap, over by $7.5M.
    const v = validateTrade(
      data,
      {
        teams: ["APR2", "OTH"],
        players: [
          { playerId: "apr2-mid", from: "APR2", to: "OTH" },
          { playerId: "oth-star", from: "OTH", to: "APR2" },
        ],
      },
      C,
    );
    expect(v.legal).toBe(false);
    const e = explainBlocked(v, [], C);
    expect(e.subject.join(" ")).toMatch(/second-apron team here/);
    expect(e.subject.join(" ")).toMatch(/100%/);
    const fixes = e.fixes.join(" ");
    // For a 2A team, extra outgoing must ALSO carry them below the line
    // (adding a second piece = aggregating, legal only if post ≤ 2A):
    // out' ≥ pre − 2A + in = 240 − 221.686 + 27 → +$25.9M, not +$7.5M.
    expect(fixes).toMatch(/Add roughly \$25\.9M more outgoing/);
    expect(fixes).toMatch(/lands them at or below the second apron/);
    // Escape route: shed below 1A and the $7.5M band covers 27 on 19.5 out.
    expect(fixes).toMatch(/shed .* separate deal first/i);
    expect(fixes).toMatch(/outgoing \+ \$7\.5M band/);
    expect(fixes).toMatch(/only signed salary counts, not cap holds/);
  });

  it("trim route respects the expanded-matching hard cap near the first apron", () => {
    // Taxpayer at $205M sends $5M for $12M. Band max = $10.25M, but trimming
    // to $10.25M still busts the 1A hard cap ($209.015M). True ceiling is
    // out + (1A − pre) ≈ $9.0M → trim ≈ $3.0M, not $1.8M.
    const hot: LeagueData = {
      leagueYear: "2026-27",
      teams: [{ id: "HOT", name: "HOT" }, { id: "OTH", name: "OTH" }],
      contracts: [
        c("hot-small", "HOT", 5_000_000),
        c("hot-fill", "HOT", 200_000_000),
        c("oth-mid", "OTH", 12_000_000),
        c("oth-fill", "OTH", 140_000_000),
      ],
    };
    const v = validateTrade(
      hot,
      {
        teams: ["HOT", "OTH"],
        players: [
          { playerId: "hot-small", from: "HOT", to: "OTH" },
          { playerId: "oth-mid", from: "OTH", to: "HOT" },
        ],
      },
      C,
    );
    expect(v.legal).toBe(false);
    const e = explainBlocked(v, [], C);
    expect(e.fixes.join(" ")).toMatch(/take back \$3\.0M less/);
    expect(e.fixes.join(" ")).not.toMatch(/\$1\.8M less/);
  });

  it("second-apron aggregation ban: names the restructure and the escape gap", () => {
    // APR2 combines $19.5M + $7.5M for one $27M player — totals fine, aggregation not.
    const v = validateTrade(
      data,
      {
        teams: ["APR2", "OTH"],
        players: [
          { playerId: "apr2-mid", from: "APR2", to: "OTH" },
          { playerId: "apr2-low", from: "APR2", to: "OTH" },
          { playerId: "oth-star", from: "OTH", to: "APR2" },
        ],
      },
      C,
    );
    expect(v.legal).toBe(false);
    expect(v.violations.some((x) => x.ruleId === "second_apron_no_aggregation")).toBe(true);
    const e = explainBlocked(v, [], C);
    expect(e.fixes.join(" ")).toMatch(/combining salaries is forbidden while the team finishes over the second apron/);
    expect(e.fixes.join(" ")).toMatch(/at or below the line makes aggregation legal/);
  });
});

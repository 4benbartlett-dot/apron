/**
 * Runnable demo: `pnpm --filter @apron/cba-engine demo`
 *
 * Shows the engine producing the thing no public trade machine does well —
 * a plain-English, cited verdict explaining WHY a trade is or isn't legal.
 *
 * Salaries below are illustrative round numbers, not real contracts.
 */
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { validateTrade } from "../src/trade";
import { capSheet } from "../src/derive";
import type { Contract, LeagueData, Trade } from "../src/types";

function contract(playerId: string, teamId: string, salary: number): Contract {
  return {
    playerId,
    playerName: playerId,
    teamId,
    years: [{ leagueYear: "2025-26", salary, guarantee: "full" }],
  };
}

const data: LeagueData = {
  leagueYear: "2025-26",
  teams: [
    { id: "SAS", name: "San Antonio" },
    { id: "DAL", name: "Dallas" },
  ],
  contracts: [
    contract("SAS_rest", "SAS", 190_000_000),
    contract("Role Player A", "SAS", 12_000_000),
    contract("Role Player B", "SAS", 13_000_000), // SAS = $215M => over the second apron
    contract("DAL_rest", "DAL", 151_000_000),
    contract("Star", "DAL", 24_000_000), // DAL = $175M => over the cap
  ],
};

// SAS (second apron) tries to combine two role players to land one $24M star.
const trade: Trade = {
  teams: ["SAS", "DAL"],
  players: [
    { playerId: "Role Player A", from: "SAS", to: "DAL" },
    { playerId: "Role Player B", from: "SAS", to: "DAL" },
    { playerId: "Star", from: "DAL", to: "SAS" },
  ],
};

const money = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

console.log("\n=== Cap sheets (2025-26) ===");
for (const t of ["SAS", "DAL"]) {
  const s = capSheet(data, t, C);
  console.log(`  ${t}: ${money(s.salary)}  [${s.tier}]`);
}

const verdict = validateTrade(data, trade, C);

console.log("\n=== Trade: SAS gets Star for Role Player A + Role Player B ===");
console.log(`  Verdict: ${verdict.legal ? "✅ LEGAL" : "❌ ILLEGAL"}`);

if (verdict.violations.length) {
  console.log("\n  Why:");
  for (const v of verdict.violations) {
    console.log(`   • [${v.ruleId}] ${v.reason}`);
    console.log(`     ↳ ${v.citation}`);
  }
}
console.log("");

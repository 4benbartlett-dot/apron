// The in-season refresh, in the order the pieces depend on each other:
//
//   1. transactions    Spotrac's feed since the newest row we hold (Firecrawl)
//   2. season          the 2026-27 schedule, scores and team ratings (bref)
//   3. stats           2026-27 player stats to date (bref)
//   4. injuries        the current injury report (bref)
//   5. --spotrac       the outside check: the apron tracker and all 30 team
//                      cap pages for both seasons (~62 Firecrawl calls), only
//                      when asked for
//
// then the two things only the app can do: rebaseline the team-strength
// snapshot against the new rosters and injuries, and run the suites. A step
// that fails stops the run; every script already refuses to write a file it
// could not fully parse, so a stopped run leaves nothing half-written.
//
//   node scripts/refresh.mjs              # 1–4, rebaseline, tests
//   node scripts/refresh.mjs --spotrac    # and the outside check
//   node scripts/refresh.mjs --no-tests   # just the data

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const WEB = join(ROOT, "apps", "web");
const args = new Set(process.argv.slice(2));

function run(label, cmd, argv, opts = {}) {
  console.log(`\n── ${label} ──`);
  const r = spawnSync(cmd, argv, { stdio: "inherit", cwd: __dirname, ...opts });
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit ${r.status}). Stopping; nothing after it ran.`);
    process.exit(r.status ?? 1);
  }
}

const node = (script, ...a) => [process.execPath, [join(__dirname, script), ...a]];

run("transactions", ...node("scrape-transactions.mjs"));
run("season", ...node("scrape-season.mjs"));
run("stats 2026-27", ...node("scrape-stats.mjs", "2027"));
run("injuries", ...node("scrape-injuries.mjs"));
if (args.has("--spotrac")) {
  run("Spotrac apron tracker", ...node("scrape-apron-tracker.mjs"));
  run("Spotrac team pages 2026-27", ...node("scrape-external-rosters.mjs"));
  run("Spotrac team pages 2027-28", ...node("scrape-external-rosters.mjs", "--year=2027"));
}
if (!args.has("--no-tests")) {
  run("rebaseline team strength", "npx", ["vitest", "run", "lib/rebaselineTeamStrength.test.ts"], {
    cwd: WEB,
    env: { ...process.env, REBASELINE_TEAM_STRENGTH: "1" },
  });
  run("tests", "npx", ["vitest", "run"], { cwd: WEB });
}
console.log(
  "\nDone. Review the diff (git diff --stat packages/data/src), file anything the" +
    "\nchecks flagged in manual-moves.json with its evidence, then commit.",
);

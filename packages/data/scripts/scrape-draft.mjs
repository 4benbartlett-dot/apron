// Scrape the 2026 NBA Draft (rookies) from Basketball-Reference into a JSON of
// rookie contracts so they show up on 2026-27 rosters.
//
//   node scripts/scrape-draft.mjs
//
// Rookie-scale salaries are APPROXIMATE: the 2025 first-round 120% scale grown
// by the projected cap ratio (~+6.7%). Replace with the official 2026 scale
// once the league posts it.

import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "rookies-2026.json");
const LEAGUE_YEAR = "2026-27";
const CAP_GROWTH = 1.067; // 2026-27 cap vs 2025-26 (~$165M / $154.647M)

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// B-Ref tricode -> our standard tricode (only these three differ).
const TEAM_MAP = { BRK: "BKN", CHO: "CHA", PHO: "PHX" };
const std = (t) => TEAM_MAP[t] ?? t;

// 2025 draft first-round rookie scale, Year 1 at 120% (pick 1..30).
const SCALE_2025_Y1 = [
  11521600, 10308600, 9257400, 8346400, 7558200, 6864700, 6266700, 5741000,
  5277100, 5013400, 4762600, 4524600, 4298300, 4083600, 3879200, 3685300,
  3500900, 3326100, 3176300, 3049000, 2927100, 2810200, 2697900, 2590100,
  2486100, 2403800, 2334400, 2319900, 2303300, 2286500,
];
const ROOKIE_MIN_2627 = Math.round(1_272_870 * CAP_GROWTH); // 2nd round ~ min

function rookieSalary(pick) {
  if (pick >= 1 && pick <= 30) {
    return Math.round((SCALE_2025_Y1[pick - 1] * CAP_GROWTH) / 1000) * 1000;
  }
  return ROOKIE_MIN_2627;
}

async function main() {
  const url = "https://www.basketball-reference.com/draft/NBA_2026.html";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.text()).replace(/<!--/g, "").replace(/-->/g, "");
  const $ = load(html);

  const rookies = [];
  $("#stats").first().find("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const pickStr = $tr.find('[data-stat="pick_overall"]').attr("csk");
    const pick = Number(pickStr);
    if (!Number.isFinite(pick) || pick <= 0) return;

    const $team = $tr.find('[data-stat="team_id"]').first();
    const teamHref = $team.find("a").attr("href") || "";
    const teamMatch = teamHref.match(/\/teams\/(\w+)\//);
    const bref = teamMatch ? teamMatch[1] : ($team.attr("csk") || "").split(".")[0];
    if (!bref) return;

    const $player = $tr.find('[data-stat="player"]').first();
    const name = $player.text().replace(/\s+/g, " ").trim();
    if (!name) return;
    const href = $player.find("a").attr("href") || "";
    const idMatch = href.match(/\/players\/\w\/([^.]+)\.html/);
    const playerId = idMatch
      ? idMatch[1]
      : `rookie-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

    const salary = rookieSalary(pick);
    rookies.push({
      playerId,
      playerName: name,
      teamId: std(bref),
      pick,
      round: pick <= 30 ? 1 : 2,
      years: [{ leagueYear: LEAGUE_YEAR, salary, guarantee: "full" }],
      signedUsing: "2026 Rookie",
    });
  });

  writeFileSync(OUT, JSON.stringify(rookies, null, 2));
  console.log(`Wrote ${rookies.length} rookies -> ${OUT}`);
  console.log("Top 5:");
  for (const r of rookies.slice(0, 5)) {
    console.log(`  #${r.pick} ${r.teamId.padEnd(4)} ${r.playerName.padEnd(22)} $${(r.years[0].salary / 1e6).toFixed(1)}M`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

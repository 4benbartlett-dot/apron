// Scrape current NBA contracts from Basketball-Reference's per-team contract
// pages into a normalized JSON matching @apron/cba-engine's Contract schema.
//
// Personal-use scraper. Usage:
//   node scripts/scrape-bref.mjs           # all 30 teams -> src/contracts-2025-26.json
//   node scripts/scrape-bref.mjs BOS       # single team, prints a sample (no write)
//
// Each salary cell on B-Ref carries csk="<integer>" — the raw dollar figure —
// and year columns are labelled y1..y6 = 2025-26 .. 2030-31.

import { load } from "cheerio";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "contracts-2025-26.json");
const LEAGUE_YEAR = "2025-26";

// [ brefCode, standardCode, name, conference ]
const TEAMS = [
  ["BOS", "BOS", "Boston Celtics", "East"],
  ["BRK", "BKN", "Brooklyn Nets", "East"],
  ["NYK", "NYK", "New York Knicks", "East"],
  ["PHI", "PHI", "Philadelphia 76ers", "East"],
  ["TOR", "TOR", "Toronto Raptors", "East"],
  ["CHI", "CHI", "Chicago Bulls", "East"],
  ["CLE", "CLE", "Cleveland Cavaliers", "East"],
  ["DET", "DET", "Detroit Pistons", "East"],
  ["IND", "IND", "Indiana Pacers", "East"],
  ["MIL", "MIL", "Milwaukee Bucks", "East"],
  ["ATL", "ATL", "Atlanta Hawks", "East"],
  ["CHO", "CHA", "Charlotte Hornets", "East"],
  ["MIA", "MIA", "Miami Heat", "East"],
  ["ORL", "ORL", "Orlando Magic", "East"],
  ["WAS", "WAS", "Washington Wizards", "East"],
  ["DEN", "DEN", "Denver Nuggets", "West"],
  ["MIN", "MIN", "Minnesota Timberwolves", "West"],
  ["OKC", "OKC", "Oklahoma City Thunder", "West"],
  ["POR", "POR", "Portland Trail Blazers", "West"],
  ["UTA", "UTA", "Utah Jazz", "West"],
  ["GSW", "GSW", "Golden State Warriors", "West"],
  ["LAC", "LAC", "Los Angeles Clippers", "West"],
  ["LAL", "LAL", "Los Angeles Lakers", "West"],
  ["PHO", "PHX", "Phoenix Suns", "West"],
  ["SAC", "SAC", "Sacramento Kings", "West"],
  ["DAL", "DAL", "Dallas Mavericks", "West"],
  ["HOU", "HOU", "Houston Rockets", "West"],
  ["MEM", "MEM", "Memphis Grizzlies", "West"],
  ["NOP", "NOP", "New Orleans Pelicans", "West"],
  ["SAS", "SAS", "San Antonio Spurs", "West"],
];

const YEAR_COLS = {
  y1: "2025-26",
  y2: "2026-27",
  y3: "2027-28",
  y4: "2028-29",
  y5: "2029-30",
  y6: "2030-31",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTeam(brefCode) {
  const url = `https://www.basketball-reference.com/contracts/${brefCode}.html`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${brefCode}: HTTP ${res.status}`);
  return res.text();
}

// B-Ref hides some tables inside HTML comments; un-comment so cheerio sees them.
function uncomment(html) {
  return html.replace(/<!--/g, "").replace(/-->/g, "");
}

function parseTeam(html, standardCode) {
  const $ = load(uncomment(html));
  const contracts = [];
  $("#contracts").first().find("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return; // repeated header rows
    const $player = $tr.find('[data-stat="player"]').first();
    const name = $player.text().replace(/\s+/g, " ").trim();
    if (!name || /team totals/i.test(name)) return;

    const href = $player.find("a").attr("href") || "";
    const idMatch = href.match(/\/players\/\w\/([^.]+)\.html/);
    // Same fallback scheme as scrape-draft.mjs — divergent fallbacks would
    // give one player two ids and a duplicate roster row.
    const playerId = idMatch
      ? idMatch[1]
      : `rookie-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

    const years = [];
    for (const [col, leagueYear] of Object.entries(YEAR_COLS)) {
      const $cell = $tr.find(`[data-stat="${col}"]`).first();
      const csk = $cell.attr("csk");
      if (csk == null || csk === "") continue;
      const salary = Math.round(Number(csk));
      if (!Number.isFinite(salary) || salary <= 0) continue;
      years.push({ leagueYear, salary, guarantee: "full" });
    }
    if (!years.length) return;
    contracts.push({ playerId, playerName: name, teamId: standardCode, years });
  });
  return contracts;
}

async function main() {
  const onlyTeam = process.argv[2];
  const list = onlyTeam
    ? TEAMS.filter((t) => t[0] === onlyTeam || t[1] === onlyTeam)
    : TEAMS;
  if (!list.length) {
    console.error(`Unknown team "${onlyTeam}".`);
    process.exit(1);
  }

  const allContracts = [];
  const teams = [];
  for (const [bref, code, name, conf] of list) {
    process.stdout.write(`  ${code} (${bref})... `);
    try {
      const html = await fetchTeam(bref);
      const contracts = parseTeam(html, code);
      allContracts.push(...contracts);
      teams.push({ id: code, name, conference: conf });
      console.log(`${contracts.length} contracts`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    if (!onlyTeam) await sleep(3500); // respect B-Ref rate limits (~17/min)
  }

  if (onlyTeam) {
    console.log("\nSample (first 6):");
    for (const c of allContracts.slice(0, 6)) {
      const y = c.years.map((yr) => `${yr.leagueYear}:$${(yr.salary / 1e6).toFixed(1)}M`).join("  ");
      console.log(`  ${c.playerName.padEnd(24)} ${y}`);
    }
    console.log(`\nTotal parsed: ${allContracts.length}`);
    return;
  }

  const out = { leagueYear: LEAGUE_YEAR, teams, contracts: allContracts };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    `\nWrote ${allContracts.length} contracts across ${teams.length} teams -> ${OUT}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

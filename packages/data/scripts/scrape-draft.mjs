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

// B-Ref tricode -> our standard tricode.
//
// The draft tables do NOT use the same codes as the season pages: B-Ref keys a
// franchise's draft history to whatever that franchise was called, so Brooklyn
// picks come back as NJN (New Jersey Nets) and New Orleans as NOH (Hornets).
// Three of the 2026 first- and second-rounders — including Brooklyn's #6 at
// $8.79M — landed on teams that do not exist, which meant the app could not see
// them at all: absent from the cap sheet, the roster, and the projection.
const TEAM_MAP = {
  BRK: "BKN", CHO: "CHA", PHO: "PHX",
  NJN: "BKN", // New Jersey Nets
  NOH: "NOP", // New Orleans Hornets
  NOK: "NOP", // New Orleans/Oklahoma City Hornets
  CHH: "CHA", // original Charlotte Hornets
  SEA: "OKC", // Seattle SuperSonics
  VAN: "MEM", // Vancouver Grizzlies
  WSB: "WAS", // Washington Bullets
  SDC: "LAC", // San Diego Clippers
  KCK: "SAC", // Kansas City Kings
};
const std = (t) => TEAM_MAP[t] ?? t;

/** The 30 franchises the app knows about. */
const TEAMS = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]);

// OFFICIAL 2026-27 first-round rookie scale, Year 1 at the 120% teams
// essentially always pay (pick 1..30).
//
// These are the published figures, not a projection. This used to scale the
// 2025 table by CAP_GROWTH, which ran about 17% light — the #1 pick came out at
// $12.29M against a real $14.75M — and because the scraper rewrites the whole
// file, re-running it silently reverted the corrected numbers. Keep the real
// scale here so a refresh cannot walk them back.
const SCALE_2026_Y1 = [
  14748000, 13195320, 11849760, 10683720, 9674760, 8787000,
  8021640, 7348680, 6754800, 6417360, 6096240, 5791680,
  5502000, 5227200, 4965480, 4717320, 4481280, 4257480,
  4065720, 3902760, 3746760, 3597120, 3453360, 3315360,
  3182280, 3076920, 2988120, 2969520, 2948280, 2926800,
];
const ROOKIE_MIN_2627 = Math.round(1_272_870 * CAP_GROWTH); // 2nd round ~ min, already exact

function rookieSalary(pick) {
  if (pick >= 1 && pick <= 30) return SCALE_2026_Y1[pick - 1];
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

  // A pick on a franchise the app doesn't know about is invisible everywhere —
  // no cap hit, no roster spot, no rotation minutes — and nothing downstream
  // complains. Refuse to write rather than strand another lottery pick.
  const stranded = rookies.filter((r) => !TEAMS.has(r.teamId));
  if (stranded.length) {
    throw new Error(
      `Unknown team code on ${stranded.length} pick(s): ` +
        stranded.map((r) => `#${r.pick} ${r.playerName} -> ${r.teamId}`).join(", ") +
        `. Add it to TEAM_MAP.`,
    );
  }

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

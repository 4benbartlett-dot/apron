// RECENT accolades from Basketball-Reference — which players made All-NBA and
// All-Defensive in the last three seasons, weighted by team level (1st > 2nd >
// 3rd) and recency (this year > two years ago). Career totals say a player was
// once great; recent selections say he still IS — so these are added ON TOP of
// the career résumé, not instead of it.
//   node scripts/scrape-recent-accolades.mjs
// Output: src/player-recent-accolades.json { byId: { nba, def } }  (weighted scores)
import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "player-recent-accolades.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const uncomment = (h) => h.replace(/<!--/g, "").replace(/-->/g, "");
// Recency weight per season (most recent counts most).
const RECENCY = { "2025-26": 1.0, "2024-25": 0.7, "2023-24": 0.45 };
const TEAM_WT = [3, 2, 1]; // 1st, 2nd, 3rd team

async function scrape(url, key, byId) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const $ = load(uncomment(await res.text()));
  let curSeason = null, teamIdx = 0;
  $("table tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const season = $tr.find("th").first().text().trim();
    if (season && /^\d{4}-\d{2}$/.test(season)) { curSeason = season; teamIdx = 0; }
    else teamIdx++;
    const rec = RECENCY[curSeason];
    if (rec == null) return; // outside our window
    const w = rec * (TEAM_WT[Math.min(teamIdx, 2)] ?? 1);
    $tr.find('a[href*="/players/"]').each((_, a) => {
      const id = ($(a).attr("href") || "").match(/\/players\/\w\/([^.]+)\.html/)?.[1];
      if (id) { byId[id] ??= { nba: 0, def: 0 }; byId[id][key] += w; }
    });
  });
}

async function main() {
  const byId = {};
  await scrape("https://www.basketball-reference.com/awards/all_league.html", "nba", byId);
  await scrape("https://www.basketball-reference.com/awards/all_defense.html", "def", byId);
  for (const id of Object.keys(byId)) { byId[id].nba = Math.round(byId[id].nba * 100) / 100; byId[id].def = Math.round(byId[id].def * 100) / 100; }
  writeFileSync(OUT, JSON.stringify({ source: "Basketball-Reference All-NBA + All-Defensive, last 3 seasons (recency + team weighted)", byId }, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(byId).length} recent-accolade records -> ${OUT}`);
  for (const id of ["jokicni01", "gilgesh01", "davisan02", "greendr01", "curryst01", "jamesle01", "wembavi01"]) {
    const r = byId[id];
    console.log(`  ${id}: recent All-NBA ${r?.nba ?? 0}, All-Def ${r?.def ?? 0}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

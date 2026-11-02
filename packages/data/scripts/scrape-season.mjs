// The season being played, from Basketball-Reference: every game on the
// 2026-27 schedule (with the score once it is final) and each team's rating
// table to date. This is what turns the offseason board's preseason
// projection into an in-season one: results so far, and the games left to
// simulate.
//
//   node scripts/scrape-season.mjs          # 2026-27 (bref's NBA_2027)
//
// Output: src/season-2027.json
//   games:   [{ date, away, home, awayPts?, homePts? }]   points only when played
//   ratings: { TEAM: { w, l, ortg, drtg, nrtg, nrtgAdj } } nrtgAdj is bref's
//            schedule-adjusted net rating
//
// Eight pages (seven months and the ratings table), a few seconds apart.
// Like scrape-transactions, a run that parses nothing ABORTS without writing.

import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASON = 2027;
const OUT = join(__dirname, "..", "src", `season-${SEASON}.json`);
const BASE = `https://www.basketball-reference.com/leagues/NBA_${SEASON}`;
const MONTHS = ["october", "november", "december", "january", "february", "march", "april"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
// bref's three-letter codes where they differ from ours.
const FIX = { BRK: "BKN", CHO: "CHA", PHO: "PHX" };
const team = (code) => FIX[code] ?? code;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDoc(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 404) return null; // a month bref has not posted
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return load((await res.text()).replace(/<!--/g, "").replace(/-->/g, ""));
}

const games = [];
for (const m of MONTHS) {
  const $ = await fetchDoc(`${BASE}_games-${m}.html`);
  await sleep(3500);
  if (!$) continue;
  $("#schedule tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const csk = $tr.find('[data-stat="date_game"]').attr("csk") ?? ""; // 202610200DET
    const away = ($tr.find('[data-stat="visitor_team_name"]').attr("csk") ?? "").split(".")[0];
    const home = ($tr.find('[data-stat="home_team_name"]').attr("csk") ?? "").split(".")[0];
    if (!/^\d{8}/.test(csk) || !away || !home) return;
    const date = `${csk.slice(0, 4)}-${csk.slice(4, 6)}-${csk.slice(6, 8)}`;
    const ap = Number($tr.find('[data-stat="visitor_pts"]').text().trim());
    const hp = Number($tr.find('[data-stat="home_pts"]').text().trim());
    const g = { date, away: team(away), home: team(home) };
    if (ap > 0 && hp > 0) Object.assign(g, { awayPts: ap, homePts: hp });
    games.push(g);
  });
}

const $r = await fetchDoc(`${BASE}_ratings.html`);
const ratings = {};
$r?.("#ratings tbody tr").each((_, tr) => {
  const $tr = $r(tr);
  const href = $tr.find('[data-stat="team_name"] a').attr("href") ?? "";
  const code = href.match(/\/teams\/([A-Z]{3})\//)?.[1];
  if (!code) return;
  const n = (s) => Number($tr.find(`[data-stat="${s}"]`).text().trim());
  ratings[team(code)] = { w: n("wins"), l: n("losses"), ortg: n("off_rtg"), drtg: n("def_rtg"), nrtg: n("net_rtg"), nrtgAdj: n("net_rtg_adj") };
});

const played = games.filter((g) => g.homePts != null).length;
if (games.length < 1000 || Object.keys(ratings).length !== 30) {
  console.error(`ABORT: ${games.length} games, ${Object.keys(ratings).length}/30 rating rows. ${OUT} left untouched.`);
  process.exit(1);
}
games.sort((a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home));
const asOf = games.filter((g) => g.homePts != null).map((g) => g.date).pop() ?? null;
writeFileSync(
  OUT,
  JSON.stringify({ source: `Basketball-Reference NBA_${SEASON} schedule + ratings`, asOf, games, ratings }, null, 1) + "\n",
);
console.log(`Wrote ${games.length} games (${played} played, through ${asOf}) and 30 rating rows -> ${OUT}`);

// Measures the two constants the season simulator needs, from a COMPLETED
// season's games rather than from folklore:
//
//   hca       home-court edge in points: the mean home margin, net of the
//             two teams' (schedule-adjusted) ratings
//   marginSd  the spread of a single game's margin around that expectation
//
// and reports how well Φ((rHome − rAway + hca) / marginSd) predicted the
// winners (Brier score, and calibration by probability bucket).
//
//   node scripts/calibrate-game-model.mjs          # 2025-26 (bref NBA_2026)
//
// Caveat written into the output: the ratings are each team's FULL-season
// figure, so the fit is in-sample and marginSd reads slightly low; the
// simulator adds rating uncertainty on top of it, which is where the
// out-of-sample error lives.
//
// Output: src/game-model-calibration.json

import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASON = Number(process.argv[2] ?? 2026);
const OUT = join(__dirname, "..", "src", "game-model-calibration.json");
const BASE = `https://www.basketball-reference.com/leagues/NBA_${SEASON}`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function doc(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return load((await res.text()).replace(/<!--/g, "").replace(/-->/g, ""));
}

const $r = await doc(`${BASE}_ratings.html`);
const rating = {};
$r("#ratings tbody tr").each((_, tr) => {
  const code = ($r(tr).find('[data-stat="team_name"] a').attr("href") ?? "").match(/\/teams\/([A-Z]{3})\//)?.[1];
  if (code) rating[code] = Number($r(tr).find('[data-stat="net_rtg_adj"]').text().trim());
});

const games = [];
for (const m of ["october", "november", "december", "january", "february", "march", "april"]) {
  await sleep(3500);
  const $ = await doc(`${BASE}_games-${m}.html`);
  if (!$) continue;
  $("#schedule tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const a = ($tr.find('[data-stat="visitor_team_name"]').attr("csk") ?? "").split(".")[0];
    const h = ($tr.find('[data-stat="home_team_name"]').attr("csk") ?? "").split(".")[0];
    const ap = Number($tr.find('[data-stat="visitor_pts"]').text().trim());
    const hp = Number($tr.find('[data-stat="home_pts"]').text().trim());
    const notes = $tr.find('[data-stat="game_remarks"]').text().trim();
    // Regular season only: the playoffs start after the last April date the
    // ratings table covers, and bref labels neither, so stop at 1,230.
    if (a && h && ap > 0 && hp > 0) games.push({ a, h, margin: hp - ap, neutral: /neutral|cup final/i.test(notes) });
  });
}
const rs = games.slice(0, 1230);
if (rs.length < 1200 || Object.keys(rating).length !== 30) throw new Error(`only ${rs.length} games / ${Object.keys(rating).length} ratings`);

const home = rs.filter((g) => !g.neutral);
const hca = home.reduce((s, g) => s + g.margin - (rating[g.h] - rating[g.a]), 0) / home.length;
const resid = rs.map((g) => g.margin - (rating[g.h] - rating[g.a]) - (g.neutral ? 0 : hca));
const marginSd = Math.sqrt(resid.reduce((s, x) => s + x * x, 0) / (resid.length - 1));

// Φ by the Abramowitz–Stegun 7.1.26 erf, the same one lib/seasonSim.ts uses.
const phi = (z) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
};
let brier = 0;
const buckets = Array.from({ length: 5 }, () => ({ n: 0, p: 0, won: 0 }));
for (const g of rs) {
  const p = phi((rating[g.h] - rating[g.a] + (g.neutral ? 0 : hca)) / marginSd);
  const won = g.margin > 0 ? 1 : 0;
  brier += (p - won) ** 2;
  const b = buckets[Math.min(4, Math.floor(p * 5))];
  b.n++; b.p += p; b.won += won;
}
brier /= rs.length;

// Season level: summing each game's probability over a team's real schedule
// should give back its real win total. This is what the simulator does with
// the games left, so it is the check that matters for the standings page.
const expW = {}, actW = {};
for (const t of Object.keys(rating)) { expW[t] = 0; actW[t] = 0; }
for (const g of rs) {
  const p = phi((rating[g.h] - rating[g.a] + (g.neutral ? 0 : hca)) / marginSd);
  expW[g.h] += p; expW[g.a] += 1 - p;
  if (g.margin > 0) actW[g.h]++; else actW[g.a]++;
}
const teamsList = Object.keys(rating);
const winsRmse = Math.sqrt(teamsList.reduce((s, t) => s + (expW[t] - actW[t]) ** 2, 0) / teamsList.length);
// Slope of actual wins on rating, and of expected wins on rating: if the
// game model spreads teams the way the league did, the two agree.
const slope = (y) => {
  const xs = teamsList.map((t) => rating[t]), ys = teamsList.map((t) => y[t]);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
};
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const out = {
  source: `Basketball-Reference NBA_${SEASON}: ${rs.length} regular-season games, schedule-adjusted net ratings`,
  season: `${SEASON - 1}-${String(SEASON % 100).padStart(2, "0")}`,
  games: rs.length,
  hca: round(hca, 2),
  marginSd: round(marginSd, 2),
  brier: round(brier, 4),
  brierCoinFlip: 0.25,
  winsRmse: round(winsRmse, 2),
  winsPerPointActual: round(slope(actW), 3),
  winsPerPointModel: round(slope(expW), 3),
  calibration: buckets.filter((b) => b.n).map((b) => ({ n: b.n, predicted: round(b.p / b.n), actual: round(b.won / b.n) })),
  caveat: "In-sample: each game is scored against its teams' full-season ratings, so marginSd is a floor. The simulator's rating uncertainty (prior and posterior variance) carries the out-of-sample error on top of it.",
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(out);

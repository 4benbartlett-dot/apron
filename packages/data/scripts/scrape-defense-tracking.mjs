// MEASURED defensive tracking from stats.nba.com, per season.
//
//   node scripts/scrape-defense-tracking.mjs 2017 … 2026
//
// Output: src/player-defense-tracking.json
//   { bySeason: { "2025": { byId: { <brefId>: {…} } , matched, unmatched } } }
//
// WHY. The dimensional model derives defense from DBPM, weighted ×7.2 for team
// defense and ×4.0 for perimeter defense. DBPM is a box-score ESTIMATE built
// largely from steals, blocks and a share of the team's defensive rating, so it
// rewards event-generating guards on good defensive teams. Luka Dončić came out
// at the 93rd percentile for perimeter defense; the league's own matchup data
// has him 142nd of 319, dead average.
//
// Two endpoints replace the guesswork:
//   leaguedashptdefend    opponent FG% when this player is the CLOSEST defender,
//                         against that shooter's normal rate. Direct, and strong
//                         for rim protection — bigs get attacked and contest.
//   leaguehustlestatsplayer  deflections and contested shots (split 2PT/3PT).
//                         This is the deterrence signal matchup data misses:
//                         elite perimeter defenders get AVOIDED, so their
//                         matchup sample stays small and unremarkable.
//
// stats.nba.com keys on its own player ids, so rows are joined to Basketball-
// Reference ids BY NAME. The join rate is asserted below — a silent drop in
// matching would quietly hollow out the defensive model.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const OUT = join(SRC, "player-defense-tracking.json");
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Accept: "application/json",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** BR-style ending year (2025) -> NBA.com season string (2024-25). */
const seasonParam = (y) => `${y - 1}-${String(y).slice(2)}`;

const norm = (n) =>
  String(n)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function api(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      const res = await fetch(url, { headers: HEADERS, signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) await sleep(4000 * (i + 1));
      else throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(4000 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

const table = (j) => {
  const rs = j.resultSets?.[0] ?? j.resultSet;
  return { idx: Object.fromEntries(rs.headers.map((h, i) => [h, i])), rows: rs.rowSet };
};

async function season(year) {
  const s = seasonParam(year);
  const def = table(
    await api(
      `https://stats.nba.com/stats/leaguedashptdefend?LeagueID=00&Season=${s}&SeasonType=Regular+Season&PORound=0&PerMode=Totals&DefenseCategory=Overall`,
    ),
  );
  await sleep(2500);
  const hus = table(
    await api(
      `https://stats.nba.com/stats/leaguehustlestatsplayer?LeagueID=00&Season=${s}&SeasonType=Regular+Season&PerMode=Totals&PlayerOrTeam=Player`,
    ),
  );

  const byName = new Map();
  for (const r of def.rows) {
    byName.set(norm(r[def.idx.PLAYER_NAME]), {
      dFga: r[def.idx.D_FGA],
      dFgPct: r[def.idx.D_FG_PCT],
      normalFgPct: r[def.idx.NORMAL_FG_PCT],
      // negative = shooters do WORSE against him
      matchupDiff: r[def.idx.PCT_PLUSMINUS],
    });
  }
  for (const r of hus.rows) {
    const k = norm(r[hus.idx.PLAYER_NAME]);
    const min = r[hus.idx.MIN] || 0;
    const cur = byName.get(k) ?? {};
    byName.set(k, {
      ...cur,
      min,
      deflections: r[hus.idx.DEFLECTIONS] ?? 0,
      contested2: r[hus.idx.CONTESTED_SHOTS_2PT] ?? 0,
      contested3: r[hus.idx.CONTESTED_SHOTS_3PT] ?? 0,
      chargesDrawn: r[hus.idx.CHARGES_DRAWN] ?? 0,
    });
  }
  return byName;
}

// Basketball-Reference ids come with their display names now, per season, so
// the join is exact within each year rather than against a global name table.
const hist = JSON.parse(readFileSync(join(SRC, "player-stats-history.json"), "utf8")).bySeason;

const years = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
const YEARS = years.length ? years : ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];

const bySeason = {};
for (const y of YEARS) {
  const byName = await season(Number(y));
  const byId = {};
  let matched = 0;
  const unmatched = [];
  // Anyone with real minutes in that season on the BR side is who we need.
  // Anyone with real minutes that season on the Basketball-Reference side.
  for (const [brefId, st] of Object.entries(hist[y]?.stats ?? {})) {
    if ((st.mp ?? 0) < 200 || !st.name) continue;
    const rec = byName.get(norm(st.name));
    if (rec) { byId[brefId] = rec; matched++; } else unmatched.push(st.name);
  }
  bySeason[y] = { byId, matched, unmatched: unmatched.length };
  console.log(`${y}: ${byName.size} tracking rows, matched ${matched} bref ids, unmatched ${unmatched.length}`);
  await sleep(2500);
}

const worst = Math.min(...Object.values(bySeason).map((s) => s.matched / (s.matched + s.unmatched)));
if (worst < 0.8) {
  throw new Error(`Name join fell to ${(worst * 100).toFixed(0)}% in some season — fix the matcher before trusting this.`);
}
writeFileSync(
  OUT,
  JSON.stringify({ source: "stats.nba.com leaguedashptdefend + leaguehustlestatsplayer", bySeason }, null, 2) + "\n",
);
console.log(`\nWrote ${OUT} (worst season join ${(worst * 100).toFixed(0)}%)`);

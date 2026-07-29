// PRIOR-SEASON statistical profiles + dimensional profiles, for out-of-sample
// model validation.
//
//   node scripts/scrape-history-stats.mjs            # 2024 and 2025
//   node scripts/scrape-history-stats.mjs 2023 2024 2025
//
// Output: src/player-stats-history.json
//   { bySeason: { "2024": { stats: {id:…}, dims: {id:…} }, … } }
//
// WHY THIS EXISTS. The projection model is calibrated against actual team net
// ratings, but every feature it uses (Apron Value, the eight dimensions) is
// derived from the SAME season it's being scored on — so a good fit can just be
// the model reading the answer off the box score. Scoring it honestly means
// building features from seasons that had already finished, then predicting the
// next one cold. That needs prior-season dimension inputs, which nothing else
// in the pipeline produces.
//
// The dims() formula below is a deliberate copy of build-dimensions.mjs. Sharing
// it would be nicer, but that script is a top-level program over the 2025-26
// files; a copy that is pinned by a test is safer than refactoring the live
// dimension build to serve an experiment. `pnpm --filter @apron/web test` fails
// if the two ever drift.

import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const OUT = join(SRC, "player-stats-history.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const uncomment = (h) => h.replace(/<!--/g, "").replace(/-->/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDoc(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return load(uncomment(await res.text()));
}

/** Keep, per player, the row with the most minutes (season-total for movers). */
function rowsById($, tableId, want, teamStat) {
  let $t = null;
  $("table").each((_, t) => { if ($(t).attr("id") === tableId) $t = $(t); });
  if (!$t) return new Map();
  const best = new Map();
  $t.find("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const href = $tr.find('[data-stat="name_display"], [data-stat="player"]').first().find("a").attr("href") || "";
    const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
    if (!id) return;
    const displayName = $tr.find('[data-stat="name_display"], [data-stat="player"]').first().text().trim();
    const num = (stat) => {
      const v = $tr.find(`[data-stat="${stat}"]`).first().text().trim();
      return v === "" ? NaN : Number(v);
    };
    const mp = num("mp");
    const rec = {};
    for (const [key, stat] of Object.entries(want)) rec[key] = num(stat);
    if (teamStat) rec.team = $tr.find(`[data-stat="${teamStat}"]`).first().text().trim();
    rec.name = displayName;
    const weight = Number.isFinite(mp) ? mp : (Number.isFinite(rec.g) ? rec.g : 0);
    const prev = best.get(id);
    if (!prev || weight > prev._w) best.set(id, { ...rec, _w: weight });
  });
  return best;
}

/** Team net rating + wins for a season, keyed by Basketball-Reference abbr. */
async function seasonTeams(year) {
  const $ = await fetchDoc(`https://www.basketball-reference.com/leagues/NBA_${year}_ratings.html`);
  const out = {};
  $("table#ratings tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.find('[data-stat="team_name"] a').attr("href") || "";
    const abbr = (href.match(/\/teams\/([A-Z]{3})\//) || [])[1];
    if (!abbr) return;
    const num = (st) => Number($tr.find(`[data-stat="${st}"]`).first().text().trim());
    out[abbr] = { nrtg: num("net_rtg"), w: num("wins"), name: $tr.find('[data-stat="team_name"]').text().trim() };
  });
  return out;
}

async function seasonStats(year) {
  const $adv = await fetchDoc(`https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`);
  const adv = rowsById($adv, "advanced", {
    age: "age", g: "games", gs: "games_started", mp: "mp", per: "per", ts: "ts_pct",
    tpar: "fg3a_per_fga_pct", ftr: "fta_per_fga_pct", orbp: "orb_pct", drbp: "drb_pct",
    trbp: "trb_pct", astp: "ast_pct", stlp: "stl_pct", blkp: "blk_pct", tovp: "tov_pct",
    usg: "usg_pct", ows: "ows", dws: "dws", ws: "ws", obpm: "obpm", dbpm: "dbpm", bpm: "bpm", vorp: "vorp",
  }, "team_name_abbr");
  await sleep(4000); // basketball-reference throttles hard
  const $pg = await fetchDoc(`https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`);
  const pg = rowsById($pg, "per_game_stats", {
    mpg: "mp_per_g", fgp: "fg_pct", tp: "fg3_per_g", tpa: "fg3a_per_g", tpp: "fg3_pct",
    ftp: "ft_pct", ppg: "pts_per_g", rpg: "trb_per_g", apg: "ast_per_g", spg: "stl_per_g", bpg: "blk_per_g",
  });

  const byId = {};
  for (const [id, a] of adv) {
    const p = pg.get(id) || {};
    const entry = {};
    const put = (k, v) => { if (Number.isFinite(v)) entry[k] = v; };
    put("age", a.age); put("g", a.g); put("gs", a.gs); put("mp", a.mp); put("mpg", p.mpg);
    put("per", a.per); put("ts", a.ts); put("tpar", a.tpar); put("ftr", a.ftr);
    put("orbp", a.orbp); put("drbp", a.drbp); put("trbp", a.trbp); put("astp", a.astp);
    put("stlp", a.stlp); put("blkp", a.blkp); put("tovp", a.tovp); put("usg", a.usg);
    put("ows", a.ows); put("dws", a.dws); put("ws", a.ws);
    put("obpm", a.obpm); put("dbpm", a.dbpm); put("bpm", a.bpm); put("vorp", a.vorp);
    put("fgp", p.fgp); put("tp", p.tp); put("tpa", p.tpa); put("tpp", p.tpp); put("ftp", p.ftp);
    put("ppg", p.ppg); put("rpg", p.rpg); put("apg", p.apg); put("spg", p.spg); put("bpg", p.bpg);
    if (a.team) entry.team = a.team;
    if (a.name) entry.name = a.name;
    if (Object.keys(entry).length) byId[id] = entry;
  }
  return byId;
}

// ---- dims(): must stay identical to build-dimensions.mjs -------------------
const POS = JSON.parse(readFileSync(join(SRC, "positions-2026.json"), "utf8")).byId;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));
const n = (v, d = 0) => (Number.isFinite(v) ? v : d);

function dims(id, s) {
  const pos = POS[id] || "SF";
  const big = pos === "C" ? 1 : pos === "PF" ? 0.5 : 0;
  const guard = pos === "PG" || pos === "SG" ? 1 : pos === "SF" ? 0.5 : 0;
  const off = clamp(50 + n(s.obpm) * 5.2 + (n(s.usg) - 20) * 0.25, 5, 100);
  const def = clamp(50 + n(s.dbpm) * 7.2 + (n(s.blkp) - 1.6) * 1.4 + (n(s.stlp) - 1.4) * 3.0 + n(s.dws) * 1.5, 5, 100);
  const play = clamp(9 + n(s.astp) * 1.5 - n(s.tovp) * 0.35, 3, 100);
  const reb = clamp(n(s.trbp) * 4.2 + 4, 3, 100);
  const vol = clamp(n(s.tpa) / 6.5, 0, 1.1);
  const acc = clamp((n(s.tpp) - 0.31) / 0.10, -1.4, 1.8);
  const accGate = clamp((n(s.tpp) - 0.31) / 0.06, 0, 1.2);
  const effVol = Math.min(1.2, vol * accGate);
  const space = clamp(42 + acc * 20 + effVol * 26 - (n(s.tpa) < 1 ? 8 : 0), 3, 100);
  const rim = clamp(n(s.bpg) * 20 + n(s.blkp) * 6 + n(s.dbpm) * 2 + big * 6, 2, 100);
  const perd = clamp(46 + n(s.stlp) * 5.5 + n(s.dbpm) * 4.0 + guard * 6, 5, 100);
  return {
    off: Math.round(off * 10) / 10, def: Math.round(def * 10) / 10,
    play: Math.round(play * 10) / 10, reb: Math.round(reb * 10) / 10,
    space: Math.round(space * 10) / 10, rim: Math.round(rim * 10) / 10,
    perd: Math.round(perd * 10) / 10, usg: Math.round(n(s.usg, 18) * 10) / 10,
  };
}
// ---------------------------------------------------------------------------

const years = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
const YEARS = years.length ? years : ["2024", "2025"];

const bySeason = {};
for (const y of YEARS) {
  const stats = await seasonStats(y);
  const d = {};
  for (const [id, s] of Object.entries(stats)) d[id] = dims(id, s);
  await sleep(4000);
  const teams = await seasonTeams(y);
  bySeason[y] = { stats, dims: d, teams };
  console.log(`${y}: ${Object.keys(stats).length} players, ${Object.keys(teams).length} teams`);
  await sleep(4000);
}

if (!Object.values(bySeason).some((s) => Object.keys(s.stats).length > 200)) {
  throw new Error("Suspiciously few players parsed — Basketball-Reference markup likely changed.");
}
writeFileSync(
  OUT,
  JSON.stringify({ source: "Basketball-Reference advanced + per_game, prior seasons (for out-of-sample validation)", bySeason }, null, 2) + "\n",
);
console.log(`Wrote ${OUT}`);

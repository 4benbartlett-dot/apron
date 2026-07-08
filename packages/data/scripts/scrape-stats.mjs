// Rich per-player statistical profile from Basketball-Reference (2025-26),
// merging the Advanced table (rate stats: USG%, TS%, rebound/assist/steal/block
// %, OBPM/DBPM, WS, 3PA rate) with the Per-Game table (scoring, 3P volume +
// accuracy, blocks, steals). This is the raw material the dimensional player
// model (offense / defense / playmaking / rebounding / spacing / rim / perimeter
// D) is derived from. Keyed by the same player id as the rest of the data.
//   node scripts/scrape-stats.mjs
// Output: src/player-stats-2026.json { byId: { id: { …stats… } } }
import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "player-stats-2026.json");
const ADV = "https://www.basketball-reference.com/leagues/NBA_2026_advanced.html";
const PG = "https://www.basketball-reference.com/leagues/NBA_2026_per_game.html";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const uncomment = (h) => h.replace(/<!--/g, "").replace(/-->/g, "");

async function fetchDoc(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return load(uncomment(await res.text()));
}

/** Keep, per player, the row with the most minutes (season-total for movers). */
function rowsById($, tableId, want) {
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
    const num = (stat) => {
      const v = $tr.find(`[data-stat="${stat}"]`).first().text().trim();
      return v === "" ? NaN : Number(v);
    };
    const mp = num("mp");
    const rec = {};
    for (const [key, stat] of Object.entries(want)) rec[key] = num(stat);
    const weight = Number.isFinite(mp) ? mp : (Number.isFinite(rec.g) ? rec.g : 0);
    const prev = best.get(id);
    if (!prev || weight > prev._w) best.set(id, { ...rec, _w: weight });
  });
  return best;
}

async function main() {
  const $adv = await fetchDoc(ADV);
  const adv = rowsById($adv, "advanced", {
    g: "games", gs: "games_started", mp: "mp", per: "per", ts: "ts_pct",
    tpar: "fg3a_per_fga_pct", ftr: "fta_per_fga_pct", orbp: "orb_pct", drbp: "drb_pct",
    trbp: "trb_pct", astp: "ast_pct", stlp: "stl_pct", blkp: "blk_pct", tovp: "tov_pct",
    usg: "usg_pct", ows: "ows", dws: "dws", ws: "ws", obpm: "obpm", dbpm: "dbpm", bpm: "bpm", vorp: "vorp",
  });

  const $pg = await fetchDoc(PG);
  const pg = rowsById($pg, "per_game_stats", {
    mpg: "mp_per_g", fgp: "fg_pct", tp: "fg3_per_g", tpa: "fg3a_per_g", tpp: "fg3_pct",
    ftp: "ft_pct", ppg: "pts_per_g", rpg: "trb_per_g", apg: "ast_per_g", spg: "stl_per_g", bpg: "blk_per_g",
  });

  const byId = {};
  for (const [id, a] of adv) {
    const p = pg.get(id) || {};
    const entry = {};
    const put = (k, v) => { if (Number.isFinite(v)) entry[k] = v; };
    // advanced rate stats
    put("g", a.g); put("gs", a.gs); put("mp", a.mp); put("mpg", p.mpg);
    put("per", a.per); put("ts", a.ts); put("tpar", a.tpar); put("ftr", a.ftr);
    put("orbp", a.orbp); put("drbp", a.drbp); put("trbp", a.trbp); put("astp", a.astp);
    put("stlp", a.stlp); put("blkp", a.blkp); put("tovp", a.tovp); put("usg", a.usg);
    put("ows", a.ows); put("dws", a.dws); put("ws", a.ws);
    put("obpm", a.obpm); put("dbpm", a.dbpm); put("bpm", a.bpm); put("vorp", a.vorp);
    // per-game box
    put("fgp", p.fgp); put("tp", p.tp); put("tpa", p.tpa); put("tpp", p.tpp); put("ftp", p.ftp);
    put("ppg", p.ppg); put("rpg", p.rpg); put("apg", p.apg); put("spg", p.spg); put("bpg", p.bpg);
    if (Object.keys(entry).length) byId[id] = entry;
  }

  writeFileSync(OUT, JSON.stringify({ source: "Basketball-Reference advanced + per_game (2025-26)", byId }, null, 2) + "\n");
  const n = Object.keys(byId).length;
  console.log(`Wrote ${n} player stat profiles -> ${OUT}`);
  const sample = (id) => { const e = byId[id]; return e ? `usg${e.usg} ts${e.ts} blk%${e.blkp} stl%${e.stlp} dbpm${e.dbpm} 3par${e.tpar} 3p%${e.tpp} ast%${e.astp}` : "?"; };
  for (const id of ["wembavi01", "greendr01", "curryst01", "jokicni01"]) console.log(`  ${id}: ${sample(id)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

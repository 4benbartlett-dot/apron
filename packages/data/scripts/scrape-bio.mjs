// Scrape Basketball-Reference for per-player BIO + availability: age, games
// played, games started, minutes — keyed by the SAME player id used in the
// contract/impact data. Age powers a real aging curve (replacing the crude
// years-of-service proxy); games/started power an availability signal.
//
//   node scripts/scrape-bio.mjs
//
// Output: src/player-bio-2026.json { byId: { playerId: { age, g, gs, mp, mpg } } }

import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "player-bio-2026.json");
const ADV = "https://www.basketball-reference.com/leagues/NBA_2026_advanced.html";
const PG = "https://www.basketball-reference.com/leagues/NBA_2026_per_game.html";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const uncomment = (h) => h.replace(/<!--/g, "").replace(/-->/g, "");

async function fetchTable(url, tableSel) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return load(uncomment(await res.text()));
}

function rows($, sel, want) {
  // Keep, per player, the row with the most minutes (the season-total row for
  // players who were traded mid-season and have multiple team rows).
  const best = new Map();
  $(`${sel} tbody tr`).each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const $p = $tr.find('[data-stat="name_display"], [data-stat="player"]').first();
    const href = $p.find("a").attr("href") || "";
    const idMatch = href.match(/\/players\/\w\/([^.]+)\.html/);
    if (!idMatch) return;
    const id = idMatch[1];
    const num = (stat) => {
      const v = $tr.find(`[data-stat="${stat}"]`).first().text().trim();
      return v === "" ? NaN : Number(v);
    };
    const mp = num("mp");
    const rec = {};
    for (const [key, stat] of Object.entries(want)) rec[key] = num(stat);
    const prev = best.get(id);
    const weight = Number.isFinite(mp) ? mp : (Number.isFinite(rec.g) ? rec.g : 0);
    if (!prev || weight > prev._w) best.set(id, { ...rec, _w: weight });
  });
  return best;
}

async function main() {
  const $adv = await fetchTable(ADV, "#advanced");
  // Advanced table: age, games, minutes total.
  const adv = rows($adv, "#advanced", { age: "age", g: "games", mp: "mp" });

  let pg = new Map();
  try {
    const $pg = await fetchTable(PG, "#per_game_stats");
    // Per-game table: games started, minutes per game.
    pg = rows($pg, "#per_game_stats", { gs: "games_started", mpg: "mp_per_g", g: "games" });
  } catch (e) {
    console.warn("per_game fetch failed, continuing with advanced only:", e.message);
  }

  const byId = {};
  for (const [id, v] of adv) {
    const p = pg.get(id) || {};
    const entry = {};
    if (Number.isFinite(v.age)) entry.age = v.age;
    if (Number.isFinite(v.g)) entry.g = v.g;
    if (Number.isFinite(p.gs)) entry.gs = p.gs;
    if (Number.isFinite(v.mp)) entry.mp = v.mp;
    if (Number.isFinite(p.mpg)) entry.mpg = p.mpg;
    else if (Number.isFinite(v.mp) && Number.isFinite(v.g) && v.g > 0) entry.mpg = Math.round((v.mp / v.g) * 10) / 10;
    if (entry.age != null) byId[id] = entry;
  }

  writeFileSync(
    OUT,
    JSON.stringify({ source: "Basketball-Reference advanced + per_game (2025-26)", scrapedFor: "2026-27 projections", byId }, null, 2) + "\n",
  );
  const n = Object.keys(byId).length;
  const withGs = Object.values(byId).filter((v) => v.gs != null).length;
  console.log(`Wrote ${n} player bios -> ${OUT} (${withGs} with games-started)`);
  const ages = Object.values(byId).map((v) => v.age).filter(Number.isFinite).sort((a, b) => a - b);
  console.log(`age range ${ages[0]}–${ages[ages.length - 1]}, median ${ages[Math.floor(ages.length / 2)]}`);
  const oldest = Object.entries(byId).sort((a, b) => b[1].age - a[1].age).slice(0, 5);
  const youngest = Object.entries(byId).sort((a, b) => a[1].age - b[1].age).slice(0, 5);
  console.log("oldest ", oldest.map(([id, v]) => `${id}:${v.age}`).join(", "));
  console.log("youngest", youngest.map(([id, v]) => `${id}:${v.age}`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });

// Scrape Basketball-Reference's advanced season stats into a per-player rating
// (0-99 OVR-style, from Box Plus/Minus) plus VORP, keyed by the SAME player id
// used in the contract data (from the /players/ link).
//
//   node scripts/scrape-ratings.mjs
//
// Output: src/ratings.json { byId: { playerId: { rating, vorp, bpm, mp } } }

import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "ratings.json");
const URL = "https://www.basketball-reference.com/leagues/NBA_2026_advanced.html";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const uncomment = (h) => h.replace(/<!--/g, "").replace(/-->/g, "");

/**
 * OVR-style rating from BPM. Low-minute players regress toward a rotation-
 * average prior (68) rather than replacement level, so an effective-but-limited
 * player (e.g. a star back from injury) isn't mis-rated as a scrub, while a
 * fluky small-sample BPM is still pulled toward the mean.
 */
function ratingFrom(bpm, mp) {
  const base = 62 + bpm * 3.4;
  const conf = Math.min(1, mp / 1200);
  return Math.max(40, Math.min(99, Math.round(68 + (base - 68) * conf)));
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const $ = load(uncomment(await res.text()));

  // Keep, per player, the row with the most minutes (the season-total row).
  const best = new Map();
  $("#advanced tbody tr, #advanced_stats tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const $p = $tr.find('[data-stat="name_display"], [data-stat="player"]').first();
    const href = $p.find("a").attr("href") || "";
    const idMatch = href.match(/\/players\/\w\/([^.]+)\.html/);
    if (!idMatch) return;
    const playerId = idMatch[1];
    const num = (stat) => {
      const v = $tr.find(`[data-stat="${stat}"]`).first().text().trim();
      return v === "" ? NaN : Number(v);
    };
    const mp = num("mp");
    const bpm = num("bpm");
    const vorp = num("vorp");
    if (!Number.isFinite(mp) || !Number.isFinite(bpm)) return;
    const prev = best.get(playerId);
    if (!prev || mp > prev.mp) {
      best.set(playerId, {
        name: $p.text().trim(),
        rating: ratingFrom(bpm, mp),
        vorp: Number.isFinite(vorp) ? vorp : 0,
        bpm,
        mp,
      });
    }
  });

  const byId = {};
  for (const [id, v] of best) byId[id] = { rating: v.rating, vorp: v.vorp, bpm: v.bpm, mp: v.mp };
  writeFileSync(OUT, JSON.stringify({ source: "Basketball-Reference advanced (2025-26)", byId }, null, 2));
  const rated = Object.values(byId);
  console.log(`Wrote ${rated.length} player ratings -> ${OUT}`);
  const top = Object.entries(byId).sort((a, b) => b[1].rating - a[1].rating).slice(0, 8);
  for (const [id, v] of top) console.log(`  ${id.padEnd(12)} OVR ${v.rating}  VORP ${v.vorp}  BPM ${v.bpm}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

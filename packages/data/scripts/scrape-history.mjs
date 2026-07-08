// Multi-year advanced stats (2023-24 + 2024-25) from Basketball-Reference, so a
// player's value can be built from his RECENT BODY OF WORK, not a single
// injury-shortened or aged season. Keyed by the same BBRef id. Combined with
// the 2025-26 profile, this de-noises small samples (a 20-game Anthony Davis is
// anchored by his prior All-NBA years) — data-driven, not "vibes".
//   node scripts/scrape-history.mjs
// Output: src/player-history.json { byId: { "2024": {bpm,vorp,mp,g}, "2025": {…} } }
import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "player-history.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const uncomment = (h) => h.replace(/<!--/g, "").replace(/-->/g, "");
const YEARS = [2024, 2025]; // 2025-26 already lives in player-stats-2026.json

async function seasonRows(year) {
  const res = await fetch(`https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${year}`);
  const $ = load(uncomment(await res.text()));
  const best = new Map();
  $("#advanced tbody tr, #advanced_stats tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const href = $tr.find('[data-stat="name_display"], [data-stat="player"]').first().find("a").attr("href") || "";
    const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
    if (!id) return;
    const num = (s) => { const v = $tr.find(`[data-stat="${s}"]`).first().text().trim(); return v === "" ? NaN : Number(v); };
    const mp = num("mp");
    const rec = { bpm: num("bpm"), vorp: num("vorp"), mp, g: num("games"), per: num("per"), ws: num("ws") };
    const prev = best.get(id);
    if (!prev || (Number.isFinite(mp) && mp > prev.mp)) best.set(id, rec); // season-total row for movers
  });
  return best;
}

async function main() {
  const byId = {};
  for (const year of YEARS) {
    const rows = await seasonRows(year);
    for (const [id, rec] of rows) {
      if (!byId[id]) byId[id] = {};
      const e = {};
      for (const [k, v] of Object.entries(rec)) if (Number.isFinite(v)) e[k] = v;
      byId[id][String(year)] = e;
    }
    console.log(`${year}: ${rows.size} players`);
  }
  writeFileSync(OUT, JSON.stringify({ source: "Basketball-Reference advanced 2023-24 + 2024-25", byId }, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(byId).length} multi-year histories -> ${OUT}`);
  for (const id of ["davisan02", "curryst01", "greendr01", "jamesle01"]) {
    const h = byId[id];
    if (h) console.log(`  ${id}: ${Object.entries(h).map(([y, e]) => `${y} bpm${e.bpm}/mp${e.mp}`).join(" | ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

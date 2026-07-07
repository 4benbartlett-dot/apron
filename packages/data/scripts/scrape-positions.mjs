// Positions per player from Basketball-Reference. PRIMARY source is the
// play-by-play table, whose pct_1..pct_5 columns give the share of a player's
// minutes actually spent at PG/SG/SF/PF/C — so we get a data-driven primary
// (most-played) AND real secondary positions (any spot he logged ≥20% at).
// Falls back to the advanced page's single position (full coverage of everyone
// who played) and then the transactions feed (rookies) for players the
// play-by-play table misses.
//   node scripts/scrape-positions.mjs
// Output: src/positions-2026.json {
//   byId: { id: primary }, secondaryById: { id: [pos,…] }, sharesById: { id: {PG,SG,SF,PF,C} }
// }
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "positions-2026.json");
const ADV = "https://www.basketball-reference.com/leagues/NBA_2026_advanced.html";
const PBP = "https://www.basketball-reference.com/leagues/NBA_2026_play-by-play.html";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const uncomment = (html) => html.replace(/<!--/g, "").replace(/-->/g, "");
const POS = ["PG", "SG", "SF", "PF", "C"];
const SECONDARY_MIN = 20; // a spot counts as a real secondary at ≥20% of minutes

const norm = (p) => {
  const m = { G: "SG", "G-F": "SG", F: "SF", "F-G": "SF", "F-C": "PF", "C-F": "C", "PG-SG": "PG", "SG-PG": "SG", "SF-PF": "SF", "PF-SF": "PF", "SG-SF": "SG", "SF-SG": "SF", "PF-C": "PF", "C-PF": "C" };
  return m[p] ?? (POS.includes(p) ? p : null);
};

async function fetchDoc(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return load(uncomment(await res.text()));
}

async function main() {
  const byId = {};
  const secondaryById = {};
  const sharesById = {};

  // 1) Play-by-play: real position shares → primary (argmax) + secondaries (≥20%).
  const $pbp = await fetchDoc(PBP);
  let $tbl = null;
  $pbp("table").each((_, t) => { if ($pbp(t).find('[data-stat="pct_1"]').length) $tbl = $pbp(t); });
  const bestMp = new Map();
  if ($tbl) {
    $tbl.find("tbody tr").each((_, tr) => {
      const $tr = $pbp(tr);
      if ($tr.hasClass("thead")) return;
      const href = $tr.find('[data-stat="name_display"], [data-stat="player"]').first().find("a").attr("href") || "";
      const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
      if (!id) return;
      const mp = Number($tr.find('[data-stat="mp"]').first().text().trim()) || 0;
      const shares = {};
      let sum = 0;
      POS.forEach((p, i) => {
        const v = $tr.find(`[data-stat="pct_${i + 1}"]`).first().text().trim().replace("%", "");
        shares[p] = v === "" ? 0 : Number(v);
        sum += shares[p];
      });
      if (sum === 0) return;
      const prev = bestMp.get(id);
      if (!prev || mp > prev) { bestMp.set(id, mp); sharesById[id] = shares; }
    });
  }
  for (const [id, shares] of Object.entries(sharesById)) {
    const ranked = POS.map((p) => ({ p, pct: shares[p] })).sort((a, b) => b.pct - a.pct);
    byId[id] = ranked[0].p;
    const sec = ranked.slice(1).filter((r) => r.pct >= SECONDARY_MIN).map((r) => r.p);
    if (sec.length) secondaryById[id] = sec;
  }
  const fromPbp = Object.keys(byId).length;

  // 2) Advanced page single position — fills anyone the pbp table missed.
  const $adv = await fetchDoc(ADV);
  $adv("#advanced tbody tr, #advanced_stats tbody tr").each((_, tr) => {
    const $tr = $adv(tr);
    if ($tr.hasClass("thead")) return;
    const href = $tr.find('[data-stat="name_display"], [data-stat="player"]').first().find("a").attr("href") || "";
    const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
    if (!id || byId[id]) return;
    const pos = norm($tr.find('[data-stat="pos"]').first().text().trim());
    if (pos) byId[id] = pos;
  });
  const afterAdv = Object.keys(byId).length;

  // 3) Transactions feed — rookies / players with no BRef row yet.
  const read = (f) => JSON.parse(readFileSync(join(__dirname, "..", "src", f), "utf8"));
  const contracts = read("contracts-2025-26.json");
  const rookies = read("rookies-2026.json");
  const cRows = Array.isArray(contracts) ? contracts : contracts.contracts;
  const rRows = Array.isArray(rookies) ? rookies : rookies.rookies;
  const nm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ё/g, "e").toLowerCase().replace(/[^a-z]/g, "");
  const nameToId = {};
  for (const c of [...cRows, ...rRows]) if (!(nm(c.playerName) in nameToId)) nameToId[nm(c.playerName)] = c.playerId;
  const idHas = new Set(Object.keys(byId));
  const tx = read("transactions.json");
  const txRows = Array.isArray(tx) ? tx : tx.rows ?? tx.transactions ?? [];
  let fromTx = 0;
  for (const r of txRows) {
    const pos = norm((r.pos || "").toUpperCase());
    const id = nameToId[nm(r.player || "")];
    if (pos && id && !idHas.has(id)) { byId[id] = pos; idHas.add(id); fromTx++; }
  }

  writeFileSync(
    OUT,
    JSON.stringify({ source: "Basketball-Reference play-by-play (position shares) + advanced + transactions, 2025-26", byId, secondaryById, sharesById }, null, 2) + "\n",
  );
  const withSec = Object.keys(secondaryById).length;
  console.log(`Wrote ${Object.keys(byId).length} positions -> ${OUT}`);
  console.log(`  ${fromPbp} primary from play-by-play, ${afterAdv - fromPbp} from advanced, ${fromTx} from transactions`);
  console.log(`  ${withSec} players carry a measured secondary position (≥${SECONDARY_MIN}% of minutes)`);
}
main().catch((e) => { console.error(e); process.exit(1); });

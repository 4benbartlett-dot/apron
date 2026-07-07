// Scrape primary position per player from Basketball-Reference's 2025-26
// advanced page (full coverage of everyone who played), then backfill from the
// transactions feed's pos field for players with no BRef row (rookies etc.).
//   node scripts/scrape-positions.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "positions-2026.json");
const URL = "https://www.basketball-reference.com/leagues/NBA_2026_advanced.html";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const uncomment = (html) => html.replace(/<!--/g, "").replace(/-->/g, "");
const norm = (p) => {
  const m = { G: "SG", "G-F": "SG", F: "SF", "F-G": "SF", "F-C": "PF", "C-F": "C", "PG-SG": "PG", "SG-PG": "SG", "SF-PF": "SF", "PF-SF": "PF", "SG-SF": "SG", "SF-SG": "SF", "PF-C": "PF", "C-PF": "C" };
  return m[p] ?? (["PG", "SG", "SF", "PF", "C"].includes(p) ? p : null);
};

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const $ = load(uncomment(await res.text()));
  const byId = {};
  $("#advanced tbody tr, #advanced_stats tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const $p = $tr.find('[data-stat="name_display"], [data-stat="player"]').first();
    const href = $p.find("a").attr("href") || "";
    const idMatch = href.match(/\/players\/\w\/([^.]+)\.html/);
    if (!idMatch) return;
    const pos = norm($tr.find('[data-stat="pos"]').first().text().trim());
    if (pos && !byId[idMatch[1]]) byId[idMatch[1]] = pos;
  });
  const fromBref = Object.keys(byId).length;

  // Fallback: transactions feed carries a pos per player (mostly recent movers
  // and rookies) — fill anyone the advanced page missed. Keyed by name → id via
  // the contracts + rookies sheets.
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
  let filled = 0;
  for (const r of txRows) {
    const pos = norm((r.pos || "").toUpperCase());
    const id = nameToId[nm(r.player || "")];
    if (pos && id && !idHas.has(id)) { byId[id] = pos; idHas.add(id); filled++; }
  }
  writeFileSync(OUT, JSON.stringify({ source: "Basketball-Reference advanced 2025-26 + transactions feed", byId }, null, 2));
  console.log(`Wrote ${Object.keys(byId).length} positions (${fromBref} from BRef, ${filled} from transactions) -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

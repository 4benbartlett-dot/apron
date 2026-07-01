// Scrape each player's NBA years of service from Basketball-Reference roster
// pages -> experience.json { playerId: yearsOfServiceEntering2026_27 }.
//
//   node scripts/scrape-experience.mjs

import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "experience.json");

const BREF_CODES = [
  "BOS", "BRK", "NYK", "PHI", "TOR", "CHI", "CLE", "DET", "IND", "MIL",
  "ATL", "CHO", "MIA", "ORL", "WAS", "DEN", "MIN", "OKC", "POR", "UTA",
  "GSW", "LAC", "LAL", "PHO", "SAC", "DAL", "HOU", "MEM", "NOP", "SAS",
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRoster(code) {
  const res = await fetch(`https://www.basketball-reference.com/teams/${code}/2026.html`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  return res.text();
}

function parse(html, out) {
  const $ = load(html.replace(/<!--/g, "").replace(/-->/g, ""));
  $("#roster").first().find("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.find('[data-stat="player"] a').attr("href") || "";
    const m = href.match(/\/players\/\w\/([^.]+)\.html/);
    if (!m) return;
    const csk = $tr.find('[data-stat="years_experience"]').attr("csk");
    const priorExp = csk == null || csk === "" ? 0 : Math.max(0, Math.round(Number(csk)));
    // Years of service ENTERING 2026-27 = experience prior to 2025-26 + 1.
    out[m[1]] = priorExp + 1;
  });
}

async function main() {
  const out = {};
  for (const code of BREF_CODES) {
    process.stdout.write(`  ${code}... `);
    try {
      parse(await fetchRoster(code), out);
      console.log(Object.keys(out).length + " total");
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
    await sleep(3500);
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nWrote years-of-service for ${Object.keys(out).length} players -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Scrape Spotrac's 2026 SIGNED free-agents page (via Firecrawl) — the most
// complete, structured source of the offseason's new deals: each signed player's
// new team, term, total, and AAV. Far richer than the rolling transactions feed.
//
//   node scripts/scrape-signings.mjs
//
// Output: src/signings.json { source, byName: { normName: {name, team, years, aav, total, status} } }

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "signings.json");
const URL = "https://www.spotrac.com/nba/free-agents/signed/_/year/2026";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const m = readFileSync(join(homedir(), ".env"), "utf8").match(/FIRECRAWL_API_KEY=(\S+)/);
  if (m) return m[1];
  throw new Error("FIRECRAWL_API_KEY not found in env or ~/.env");
}

/** Normalize a player name for joining across sources (matches league.ts). */
export function normName(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Format A: …![](logo)TEAM | [Name](…/id/N/…) | POS | YEARS | $TOTAL | $AAV | STATUS |
const ROW =
  /!\[\]\([^)]*\)([A-Za-z]{2,4})\s*\|\s*\[([^\]]+)\]\(https:\/\/www\.spotrac\.com\/nba\/player\/_\/id\/\d+\/[^)]*\)\s*\|\s*[A-Z/]+\s*\|\s*(\d+)\s*\|\s*\$([\d,]+)\s*\|\s*\$([\d,]+)\s*\|\s*([A-Za-z]+)\s*\|/g;

// Format B (2026 refresh): | ![](…/nba_wsh.png) | [Name](…)<br>Pos <br>Age… | 4 yr, $TOTAL <br>AAV: $AAV …
// Team is only in the logo slug (nba_wsh → WSH, orl_20251 → ORL, nba_lac1 → LAC).
const ROW2 =
  /!\[\]\([^)]*\/(?:nba_)?([a-z]+)[0-9_]*\.png\)\s*\|\s*\[([^\]]+)\]\(https:\/\/www\.spotrac\.com\/nba\/player\/_\/id\/\d+\/[^)]*\)[^|]*\|\s*(\d+)\s*yr,\s*\$([\d,]+)\s*<br>\s*AAV:\s*\$([\d,]+)/g;

async function main() {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: URL, formats: ["markdown"], onlyMainContent: true, maxAge: 0 }),
  });
  const j = await res.json();
  if (!j.success) throw new Error("Firecrawl failed: " + JSON.stringify(j).slice(0, 200));
  const md = j.data.markdown;

  const byName = {};
  let m;
  while ((m = ROW.exec(md))) {
    const [, team, name, years, total, aav, status] = m;
    byName[normName(name)] = {
      name,
      team,
      years: Number(years),
      total: Number(total.replace(/,/g, "")),
      aav: Number(aav.replace(/,/g, "")),
      status,
    };
  }
  while ((m = ROW2.exec(md))) {
    const [, slug, name, years, total, aav] = m;
    if (byName[normName(name)]) continue; // format A already captured it
    byName[normName(name)] = {
      name,
      team: slug.toUpperCase(),
      years: Number(years),
      total: Number(total.replace(/,/g, "")),
      aav: Number(aav.replace(/,/g, "")),
      status: "Signed",
    };
  }

  const count = Object.keys(byName).length;
  writeFileSync(OUT, JSON.stringify({ source: "Spotrac signed free agents (via Firecrawl)", byName }, null, 2));
  console.log(`Wrote ${count} signings -> ${OUT}`);
  const top = Object.values(byName).sort((a, b) => b.aav - a.aav).slice(0, 8);
  for (const s of top) console.log(`  ${s.name.padEnd(22)} ${s.team}  ${s.years}yr $${(s.total / 1e6).toFixed(0)}M  AAV $${(s.aav / 1e6).toFixed(1)}M  [${s.status}]`);
}

main();

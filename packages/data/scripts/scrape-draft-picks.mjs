// Scrape the NBA future-draft-pick ledger (RealGM via Firecrawl): every team's
// incoming and outgoing future picks with protection language.
//
//   node scripts/scrape-draft-picks.mjs

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const URL = "https://basketball.realgm.com/nba/draft/future_drafts/detailed";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const env = readFileSync(join(homedir(), ".env"), "utf8");
  const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
  if (!m) throw new Error("FIRECRAWL_API_KEY not found");
  return m[1];
}

// name -> standard tricode (from the contracts dataset's team list)
const teams = JSON.parse(readFileSync(join(SRC, "contracts-2025-26.json"), "utf8")).teams;
const nameToCode = new Map(teams.map((t) => [t.name, t.id]));
// RealGM uses a few names that differ from the contracts dataset.
nameToCode.set("Philadelphia Sixers", "PHI");

async function scrape(url, key) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const j = await res.json();
  if (!j.success) throw new Error("Firecrawl failed");
  return j.data.markdown;
}

function parseCell(cell) {
  const c = cell.trim();
  if (!c || /^No picks/i.test(c)) return [];
  return c
    .split(/<br>(?=\*\*)/)
    .map((part) => {
      const m = part.match(/^\*\*(.+?)\*\*(?:<br>([\s\S]*))?$/);
      if (!m) return null;
      const headline = m[1].replace(/\\([[\]])/g, "$1").trim();
      const detail = (m[2] || "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\\([[\]])/g, "$1")
        .replace(/<br>/g, " ")
        .trim();
      return { headline, detail };
    })
    .filter(Boolean);
}

const key = getKey();
const md = await scrape(URL, key);

const out = {};
let current = null;
for (const line of md.split("\n")) {
  const h = line.match(/^##\s+(.+?)\s+Future Traded Pick Details/);
  if (h) {
    const code = nameToCode.get(h[1].trim());
    current = code ?? null;
    if (current) out[current] = { incoming: [], outgoing: [] };
    continue;
  }
  if (!current) continue;
  const row = line.match(/^\|\s*(20\d\d)\s*\|(.*)\|(.*)\|\s*$/);
  if (!row) continue;
  const year = Number(row[1]);
  for (const p of parseCell(row[2])) out[current].incoming.push({ year, ...p });
  for (const p of parseCell(row[3])) out[current].outgoing.push({ year, ...p });
}

writeFileSync(join(SRC, "draft-picks.json"), JSON.stringify({ source: "RealGM (via Firecrawl)", teams: out }, null, 2));
const teamsParsed = Object.keys(out).length;
const total = Object.values(out).reduce((n, t) => n + t.incoming.length + t.outgoing.length, 0);
console.log(`Wrote pick ledger for ${teamsParsed} teams (${total} pick obligations) -> draft-picks.json`);
for (const code of ["BKN", "OKC", "SAS"]) {
  const t = out[code];
  if (t) console.log(`  ${code}: ${t.incoming.length} incoming, ${t.outgoing.length} outgoing`);
}

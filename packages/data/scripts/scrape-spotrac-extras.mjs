// Scrape Spotrac resource pages via Firecrawl: upcoming option/guarantee
// deadlines and extension-eligible players.
//
//   node scripts/scrape-spotrac-extras.mjs

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const env = readFileSync(join(homedir(), ".env"), "utf8");
  const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
  if (!m) throw new Error("FIRECRAWL_API_KEY not found");
  return m[1];
}

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

// Parse Spotrac's deadline-style tables:
// | date | [Player](url) | ![](img) CODE | POS | KIND<br>..<br>year<br>..<br>note | $amount |
function parseRows(md) {
  const re =
    /^\|\s*([^|]+?)\s*\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*(?:!\[\][^)]*\)\s*)?([A-Z]{2,4})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/;
  const rows = [];
  for (const line of md.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const [, date, player, team, pos, statusBlock, amountRaw] = m;
    if (!/\d/.test(date)) continue; // skip header
    const parts = statusBlock.split("<br>").map((s) => s.trim()).filter(Boolean);
    const kind = parts[0] || "";
    const note = parts.slice(1).filter((p) => !/^\d{4}-\d{2}$/.test(p)).join(" — ");
    const amount = Number((amountRaw.match(/\$([\d,]+)/)?.[1] || "").replace(/,/g, "")) || 0;
    rows.push({ date: date.trim(), player: player.trim(), team: team.trim(), pos: pos.trim(), kind, amount, note });
  }
  return rows;
}

const key = getKey();

const upcoming = parseRows(await scrape("https://www.spotrac.com/nba/transactions/upcoming", key));
writeFileSync(join(SRC, "upcoming-deadlines.json"), JSON.stringify({ rows: upcoming }, null, 2));
console.log(`upcoming-deadlines: ${upcoming.length} rows`);

const extEligible = parseRows(
  await scrape("https://www.spotrac.com/nba/transactions/upcoming/_/type/extension-eligible", key),
);
writeFileSync(join(SRC, "extension-eligible.json"), JSON.stringify({ rows: extEligible }, null, 2));
console.log(`extension-eligible: ${extEligible.length} rows`);
for (const r of extEligible.slice(0, 5)) console.log(`  ${r.player} (${r.team}) — ${r.kind}`);

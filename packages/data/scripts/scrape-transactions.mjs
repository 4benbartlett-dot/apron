// Scrape Spotrac's NBA transactions feed via Firecrawl (Spotrac 403s direct
// scraping; Firecrawl renders + proxies past Cloudflare). Produces a structured
// recent-transactions list.
//
//   node scripts/scrape-transactions.mjs
//
// Reads FIRECRAWL_API_KEY from the environment or ~/.env.

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "transactions.json");
const URL = "https://www.spotrac.com/nba/transactions";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  try {
    const env = readFileSync(join(homedir(), ".env"), "utf8");
    const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  throw new Error("FIRECRAWL_API_KEY not found in env or ~/.env");
}

async function scrape(url, key) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const j = await res.json();
  if (!j.success) {
    throw new Error("Firecrawl failed: " + JSON.stringify(j).slice(0, 200));
  }
  return j.data.markdown;
}

function classify(detail) {
  if (/Traded/i.test(detail)) return "Trade";
  if (/Re-Signed/i.test(detail)) return "Re-sign";
  if (/Agreed|Signed/i.test(detail)) return "Signing";
  if (/Extension|Extended/i.test(detail)) return "Extension";
  if (/Waived|Released/i.test(detail)) return "Release";
  if (/Qualifying/i.test(detail)) return "Qualifying Offer";
  if (/Option/i.test(detail)) return "Option";
  if (/Renounced/i.test(detail)) return "Renounce";
  return "Other";
}

function parse(md) {
  const re =
    /^\s*-\s*!\[\]\([^)]*\)\[([^\]]+?)\s*\(([^)]*)\)\]\([^)]*\)\s*\*\*([^*]+)\*\*\s*\\?-\s*(.+)$/;
  const txns = [];
  for (const line of md.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const [, name, pos, date, detailRaw] = m;
    const detail = detailRaw.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
    txns.push({
      player: name.trim(),
      pos: pos.trim(),
      date: date.trim(),
      type: classify(detail),
      detail,
    });
  }
  return txns;
}

const key = getKey();
const md = await scrape(URL, key);
const transactions = parse(md);
writeFileSync(
  OUT,
  JSON.stringify({ source: "Spotrac (via Firecrawl)", transactions }, null, 2),
);
console.log(`Wrote ${transactions.length} transactions -> ${OUT}`);
for (const t of transactions.slice(0, 8)) {
  console.log(`  [${t.type}] ${t.player} — ${t.detail.slice(0, 76)}`);
}

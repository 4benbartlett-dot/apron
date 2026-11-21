// Scrape Spotrac's league-wide 2026-27 APRON TRACKER via Firecrawl — every
// team's apron allocation, and whether Spotrac shows it hard-capped.
//
//   node scripts/scrape-apron-tracker.mjs
//
// Why this exists. Every other file here is an INPUT: contracts, transactions,
// exceptions, the things our team salary is computed FROM. This one is the
// only OUTPUT check — an independent party's answer to the same question, for
// all 30 teams at once, so a disagreement surfaces as a number instead of
// waiting for someone to tweet about the one team we happened to look at.
//
// It is deliberately not wired into the app. Nothing renders from it and no
// projection reads it; externalCapCheck.test.ts diffs against it and that is
// all. Their number is not automatically the right one — we have already found
// cases where ours reproduces the beat writers and theirs lags a filing — but
// an unexplained gap is a lead, and a gap we have explained belongs written
// down next to the explanation.

import "./firecrawl-throttle.mjs";
import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localToday } from "./today.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "external-cap-check.json");
const URL_ = "https://www.spotrac.com/nba/apron/_/year/2026";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const env = readFileSync(join(homedir(), ".env"), "utf8");
  const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
  if (!m) throw new Error("FIRECRAWL_API_KEY not found in env or ~/.env");
  return m[1];
}

const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url: URL_, formats: ["markdown"], onlyMainContent: true, maxAge: 0 }),
});
const j = await res.json();
if (!j.success) throw new Error("Firecrawl failed: " + JSON.stringify(j).slice(0, 200));
const md = j.data.markdown;

// Parsed by COLUMN NAME. This reader has been rewritten twice for the same
// reason: it assumed where things were. The first version was one long regex
// and matched 23 of 30 teams, because every club over an apron renders its
// space as "$-5,764,492" and the pattern expected "-$5,764,492". The second
// read cells by position, and in mid-November 2026 Spotrac redesigned the
// table: new columns, a new order, and the team code moved inside a link.
// It parsed 0 of 30. The header row says which column is which, so read it.
//
//   | Rank | Team | Record | 1st Apron Space | 2nd Apron Space | Total Apron | Hard Cap | Apron Status | Players |
//   | 1 | [![](…)NuggetsDENOver 2nd Apron](… "Denver Nuggets") | 8-5 | -$15,821,337 | -$3,150,337 | $224,836,337 | - | Over 2nd Apron | 14 |

const TEAM_FIX = { WSH: "WAS", GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", LA: "LAC" };
const num = (s) => Number(String(s).replace(/[^\d]/g, ""));
/** A dollar figure with its sign, wherever the minus is written. */
const signed = (s) => (/-/.test(String(s)) ? -1 : 1) * num(s);
const cellsOf = (line) => line.split("|").slice(1, -1).map((c) => c.trim());

const lines = md.split("\n");
const header = lines.find((l) => /^\|\s*Rank\s*\|/i.test(l));
const cols = header ? cellsOf(header).map((c) => c.toLowerCase()) : [];
const col = Object.fromEntries(
  ["team", "total apron", "hard cap", "1st apron space", "2nd apron space"].map((name) => [name, cols.indexOf(name)]),
);
const missing = Object.entries(col).filter(([, i]) => i < 0).map(([name]) => name);
if (missing.length) {
  console.error(
    `\nABORT: the apron tracker's table has no ${missing.map((m) => `"${m}"`).join(" or ")} column.\n` +
      `Its header reads: ${header ?? "(no header row found)"}\n${OUT} left untouched.`,
  );
  process.exit(1);
}

const byTeam = {};
let firstApron = 0;
let secondApron = 0;
for (const line of lines) {
  if (!/^\|\s*\d+\s*\|/.test(line)) continue; // rank-led data rows only
  const cells = cellsOf(line);
  // "NuggetsDENOver 2nd Apron", "Trail BlazersPORUnder Aprons", "76ersPHIUnder Aprons":
  // nickname, code, status, run together as the link's text. An older layout
  // led the cell with the code.
  const teamCell = cells[col.team] ?? "";
  const code = teamCell.match(/([A-Z]{2,4})(?:Over|Under)\b/)?.[1] ?? teamCell.match(/^([A-Z]{2,3})\b/)?.[1];
  const total = cells[col["total apron"]] ?? "";
  if (!code || !/\$[\d,]+/.test(total)) continue;
  const cap = cells[col["hard cap"]] ?? "";
  const apronSalary = num(total);
  byTeam[TEAM_FIX[code] ?? code] = {
    apronSalary,
    firstApronHardCapped: /1st/i.test(cap),
    secondApronHardCapped: /2nd/i.test(cap),
  };
  // The page prints the lines rounded ("$209M"). The table has them exactly:
  // a team's total plus its room is the line.
  firstApron ||= apronSalary + signed(cells[col["1st apron space"]]);
  secondApron ||= apronSalary + signed(cells[col["2nd apron space"]]);
}

const n = Object.keys(byTeam).length;
// A partial parse is worse than none: it would look like 30 agreements and a
// handful of silently missing teams. All or nothing.
if (n !== 30) {
  console.error(
    `\nABORT: parsed ${n}/30 teams from the apron tracker. The columns were found but the rows didn't read;\n` +
      `look at how a team cell is written now. ${OUT} left untouched.`,
  );
  process.exit(1);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "Spotrac NBA Team Apron Tracker (via Firecrawl)",
      url: URL_,
      asOf: localToday(),
      note:
        "An INDEPENDENT answer to the same question our sheet computes, for all 30 teams. Nothing in the app reads this; externalCapCheck.test.ts diffs against it so a disagreement is a number rather than a surprise. Their figure is not automatically correct — ours has reproduced beat-writer numbers Spotrac lagged on — but an unexplained gap is a lead.",
      lines: { firstApron, secondApron },
      byTeam,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Wrote ${n} teams -> ${OUT}`);
console.log(`  1st apron $${firstApron.toLocaleString()} · 2nd apron $${secondApron.toLocaleString()}`);
for (const [t, v] of Object.entries(byTeam).sort((a, b) => b[1].apronSalary - a[1].apronSalary).slice(0, 5))
  console.log(`  ${t} $${v.apronSalary.toLocaleString()}`);

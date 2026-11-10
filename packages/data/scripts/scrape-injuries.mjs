// Real, current injury FACTS from Basketball-Reference's injury report — keyed
// by the same player id as the rest of the data. Not a probabilistic "injury
// prone" tag: the actual reported injury (torn ACL, out for season, etc.), its
// date, and — for the majors that bleed into 2026-27 — a standard-recovery
// estimate of how many games a player is likely to miss to START next season.
//   node scripts/scrape-injuries.mjs
// Output: src/player-injuries-2026.json { byId: { id: { name, team, date, desc, type, status, gamesOut } } }
import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localToday } from "./today.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "player-injuries-2026.json");
const URL = "https://www.basketball-reference.com/friv/injuries.fcgi";
/** The last pull, for onset dates (estimateOut). */
const PREV = (() => {
  try { return JSON.parse(readFileSync(OUT, "utf8")).byId ?? {}; } catch { return {}; }
})();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// 2026-27 regular season window (for translating a recovery date into games missed).
const SEASON_START = new Date("2026-10-20");
const SEASON_END = new Date("2027-04-12");
const SEASON_DAYS = (SEASON_END - SEASON_START) / 86400000;
const DAY = 86400000;
// Games are counted from the later of opening night and the day of the pull:
// once the season is on, `gamesOut` is the games he is expected to miss from
// here, which is what the projection (and the simulator, which plays only the
// games left) needs. In the offseason it is the games he misses to start it.
// `gamesLeft` (top of the file) is the same count for a healthy player, so
// gamesOut / gamesLeft is the share of what's left he misses. 82 − gamesOut
// is not: by Nov 2 a season-ending injury is 75 out of 75, not 75 of 82.
const FROM = new Date(Math.max(SEASON_START.getTime(), Date.now()));
const GAMES_LEFT = Math.round(((SEASON_END - FROM) / DAY / SEASON_DAYS) * 82);
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, several: 3, few: 2, couple: 2 };
const num = (w) => (/^\d+(\.\d+)?$/.test(w) ? Number(w) : WORDS[w.toLowerCase()]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * How long he is out, in days from the report, from the report's OWN words
 * where it gives a timeline — "3-4 weeks", "6-8 weeks", "up to two months",
 * "between January and February", "several months", "out for season" — and
 * from the injury type only where it gives none. In-season, the type windows
 * read a two-month arthroscopy (Edwards, Oct 27) as a lost season; the
 * report said two months.
 */
function statedDays(desc, reported) {
  const d = desc.toLowerCase();
  if (/out for (the )?season|remainder of the (20\d\d.20\d\d )?season|season-ending|out for the 20\d\d.20\d\d season/.test(d)) return Infinity;
  const unit = (u) => (/month/.test(u) ? 30.4 : /week/.test(u) ? 7 : 1);
  const NUMW = "(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|several|few|couple)";
  const range = d.match(new RegExp(`${NUMW}\\s*(?:-|–|to)\\s*${NUMW}\\s*(day|week|month)s?`));
  // The UPPER end of a range, as the wire parser does (statedAbsence.ts):
  // teams sit players past the optimistic number.
  if (range) return num(range[2]) * unit(range[3]);
  const single = d.match(new RegExp(`${NUMW}(?:\\s+of)?\\s+(day|week|month)s?`));
  if (single && num(single[1]) != null) return num(single[1]) * unit(single[2]);
  // "return sometime between January and February", "expected back in December"
  const named = MONTHS.map((m, i) => (d.includes(m) ? i : -1)).filter((i) => i >= 0);
  if (named.length && /return|back|sidelined|until|between|targeting|timeline/.test(d)) {
    const r = new Date(reported);
    const at = (mi) => {
      const y = r.getFullYear() + (mi < r.getMonth() ? 1 : 0);
      return new Date(y, mi, 15).getTime();
    };
    const mid = named.map(at).reduce((a, b) => a + b, 0) / named.length;
    return Math.max(0, (mid - r.getTime()) / DAY);
  }
  return null;
}

/**
 * `onset` is when the injury happened, as best this file knows: bref's date
 * column is the report's latest UPDATE, so DiVincenzo's April Achilles tear
 * reads "Oct 5" in October. A stated timeline runs from the report (it is
 * that report's estimate); a type window runs from the onset.
 */
function estimateOut(desc, date, onset = date) {
  const reported = new Date(date);
  if (isNaN(reported)) return { gamesOut: 0, status: "day-to-day", basis: "no date" };
  const d = desc.toLowerCase();
  let days = statedDays(desc, reported);
  let start = reported;
  let basis = days == null ? null : "stated timeline";
  if (days == null) {
    const months = recoveryMonths(desc);
    if (/^day to day/.test(d)) { days = 2; basis = "day to day"; }
    // "Will miss the opener as he continues to recover": the report says one
    // game and nothing about a tear, so two weeks, not a surgery window.
    else if (/will miss .*(opener|game)|continues to recover/.test(d) && !/torn|rupture|acl|achilles|fracture/.test(d)) { days = 14; basis = "short, no timeline"; }
    else if (months > 0) {
      // A PARTIAL tear is not the rupture the window was set for: a quarter of it.
      days = months * 30.4 * (/partial/.test(d) ? 0.25 : 1);
      const o = new Date(onset);
      start = isNaN(o) ? reported : o;
      basis = /partial/.test(d) ? "injury type (partial)" : "injury type";
    }
    else if (/^out/.test(d)) { days = 7; basis = "out, no timeline"; }
    else { days = 0; basis = "none"; }
  }
  const back = days === Infinity ? SEASON_END : new Date(start.getTime() + days * DAY);
  const end = back > SEASON_END ? SEASON_END : back;
  const gamesOut = end > FROM ? Math.min(82, Math.round(((end - FROM) / DAY / SEASON_DAYS) * 82)) : 0;
  const status = days === Infinity || end >= SEASON_END ? "out (season)" : gamesOut >= 5 ? "out (weeks)" : gamesOut > 0 ? "day-to-day" : "available";
  return { gamesOut, status, basis };
}

// Standard recovery windows (months) for the injuries that can carry into next
// season. Everything else is treated as healed over the offseason.
function recoveryMonths(desc) {
  const d = desc.toLowerCase();
  if (d.includes("achilles")) return 12;
  if (d.includes("acl")) return 11;
  if (d.includes("patellar") || d.includes("microfracture")) return 9;
  if ((d.includes("knee") && (d.includes("surg") || d.includes("torn") || d.includes("repair")))) return 6;
  if (d.includes("fracture") || d.includes("broken") || d.includes("stress")) return 4.5;
  if (d.includes("hip") && d.includes("surg")) return 6;
  if (d.includes("foot") && d.includes("surg")) return 5;
  return 0; // minor / soft-tissue / anything expected to heal by camp
}

function injuryType(desc) {
  const d = desc.toLowerCase();
  if (d.includes("achilles")) return "Torn Achilles";
  if (d.includes("acl")) return "Torn ACL";
  const m = desc.match(/\(([^)]+)\)/); // BRef puts the body part in parens
  return m ? m[1] : "Injury";
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const $ = load(await res.text());

  const byId = {};
  let majors = 0;
  $("#injuries tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.find('a[href*="/players/"]').first().attr("href") || "";
    const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
    if (!id) return;
    const name = $tr.find('a[href*="/players/"]').first().text().trim();
    const team = $tr.find('[data-stat="team_name"]').text().trim() || $tr.find("td").eq(0).text().trim();
    const date = $tr.find('[data-stat="date_update"]').text().trim() || $tr.find("td").eq(1).text().trim();
    const desc = $tr.find('[data-stat="note"]').text().trim() || $tr.find("td").last().text().trim();

    const type = injuryType(desc);
    // Same player, same body part, still on the report: keep the earliest
    // date this file has seen for it (see estimateOut).
    const was = PREV[id];
    const sameInjury = was && (was.type === type || (/achilles/i.test(was.desc ?? "") && /achilles/i.test(desc)) || (/acl/i.test(was.desc ?? "") && /acl/i.test(desc)));
    const earliest = [was?.onset, was?.date].filter(Boolean).map((x) => [x, new Date(x).getTime()]).filter(([, t]) => !isNaN(t)).sort((a, b) => a[1] - b[1])[0]?.[0];
    const onset = sameInjury && earliest && new Date(earliest) < new Date(date) ? earliest : date;
    const { gamesOut, status, basis } = estimateOut(desc, date, onset);
    if (gamesOut >= 5) majors++;
    byId[id] = { name, team, date, ...(onset !== date ? { onset } : {}), desc: desc.slice(0, 200), type, status, gamesOut, basis };
  });

  const asOf = localToday();
  writeFileSync(OUT, JSON.stringify({ source: "Basketball-Reference injury report", asOf, gamesLeft: GAMES_LEFT, byId }, null, 2) + "\n");
  const total = Object.keys(byId).length;
  console.log(`Wrote ${total} injury records -> ${OUT} (${majors} bleed into 2026-27)`);
  const bleed = Object.entries(byId).filter(([, v]) => v.gamesOut >= 5).sort((a, b) => b[1].gamesOut - a[1].gamesOut);
  for (const [id, v] of bleed) console.log(`  ${id.padEnd(11)} ${v.name.padEnd(20)} ${v.type.padEnd(14)} ~${v.gamesOut}g out — ${v.date}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

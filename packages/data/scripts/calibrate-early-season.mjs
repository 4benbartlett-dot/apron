// How much should a player's first few weeks of a season move his value?
//
// Measured on past seasons, not assumed. For each of five completed seasons
// (2021-22 → 2025-26) and four points in each (13, 27, 42 and 75 days after
// opening night: about 8 to 39 games), take:
//
//   prior   the value model's own multi-year BPM (league.ts multiYearBpm:
//           the three seasons before, weighted 0.45/0.35/0.2, minutes-
//           confident, clipped, shrunk) — exactly what the board would have
//           carried into that season
//   early   his BPM and minutes to that date, from a Wayback Machine snapshot
//           of Basketball-Reference's season-to-date advanced page
//   rest    his BPM over the rest of that season, backed out of the final
//           page: (bpm_full·mp_full − bpm_early·mp_early) / mp_rest
//
// and fit the one number a blend needs: M, the minutes of this season's play
// the prior is worth. pred = (prior·M + early·mp) / (M + mp). M = ∞ ignores
// the season; M = 0 believes it outright. The fit minimizes rest-of-season
// error weighted by rest-of-season minutes (a BPM over more minutes is less
// noisy), and the output reports the error at M = ∞ beside it so the gain
// is on the record, not just the weight.
//
// Rookies are fitted apart. The board's rookie projections were not archived,
// so their prior here is what draft slot alone said: a + b·ln(pick), fitted on
// the rookie seasons of the other four classes. The board's projection also
// reads college production, so its prior is somewhat better than this one and
// the fitted rookie M is, if anything, low. The board uses ROOKIE_PRIOR_MINUTES,
// set between the fit and the veterans' M for that reason; the output reports
// the error at all three.
//
//   node scripts/calibrate-early-season.mjs
//
// Pages are cached in $TMPDIR/apron-bref-cache, so a re-run is offline.
// Output: src/early-season-calibration.json

import { load } from "cheerio";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localToday } from "./today.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "early-season-calibration.json");
const CACHE = join(tmpdir(), "apron-bref-cache");
mkdirSync(CACHE, { recursive: true });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Season (bref's end-year) → opening night.
const OPENERS = { 2022: "2021-10-19", 2023: "2022-10-18", 2024: "2023-10-24", 2025: "2024-10-22", 2026: "2025-10-21" };
// Days after opening night to read the season-to-date page. 13 days is where
// 2026-27 stands on Nov 2.
const CUTOFF_DAYS = [13, 27, 42, 75];
// What the board uses for a rookie. The fit on draft slot alone says 525; the
// veterans' M is 1,025. The error is nearly flat from 400 to 750, and the
// board's rookie projection is a better prior than slot alone, so its M sits
// above the fit. 750 keeps about two thirds of the gain. Chosen Nov 20, 2026.
const ROOKIE_PRIOR_MINUTES = 750;

const advUrl = (s) => `https://www.basketball-reference.com/leagues/NBA_${s}_advanced.html`;

async function cached(key, fetcher) {
  const f = join(CACHE, key.replace(/[^\w.-]/g, "_"));
  if (existsSync(f)) return readFileSync(f, "utf8");
  const body = await fetcher();
  writeFileSync(f, body);
  return body;
}

async function get(url, pause) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      await sleep(pause);
      return await res.text();
    }
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  throw new Error(`gave up on ${url}`);
}

/** id → { bpm, mp, g } from an advanced page; movers keep their most-minutes
 * (season-total) row, as scrape-stats.mjs does. */
function parse(html) {
  const $ = load(html.replace(/<!--/g, "").replace(/-->/g, ""));
  const $t = $("table#advanced, table#advanced_stats").first();
  const out = new Map();
  $t.find("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("thead")) return;
    const href = $tr.find('[data-stat="name_display"], [data-stat="player"]').first().find("a").attr("href") || "";
    const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
    if (!id) return;
    const n = (s) => Number($tr.find(`[data-stat="${s}"]`).first().text().trim() || NaN);
    const row = { bpm: n("bpm"), mp: n("mp"), g: n("g") || n("games") };
    if (!Number.isFinite(row.mp)) return;
    const prev = out.get(id);
    if (!prev || row.mp > prev.mp) out.set(id, row);
  });
  if (out.size < 300) throw new Error(`only ${out.size} players parsed`);
  return out;
}

async function finalPage(season) {
  return parse(await cached(`final-${season}.html`, () => get(advUrl(season), 3500)));
}

async function snapshot(season, days) {
  const target = new Date(new Date(OPENERS[season]).getTime() + days * 864e5);
  const ymd = target.toISOString().slice(0, 10).replace(/-/g, "");
  const list = JSON.parse(
    await cached(`cdx-${season}.json`, () =>
      get(
        `http://web.archive.org/cdx/search/cdx?url=basketball-reference.com/leagues/NBA_${season}_advanced.html` +
          `&from=${season - 1}1015&to=${season}0420&output=json&fl=timestamp&filter=statuscode:200`,
        1000,
      ),
    ),
  ).slice(1).map((r) => r[0]);
  // The snapshot nearest the target day.
  const ts = list.sort((a, b) => Math.abs(Number(a.slice(0, 8)) - Number(ymd)) - Math.abs(Number(b.slice(0, 8)) - Number(ymd)))[0];
  const html = await cached(`snap-${season}-${ts}.html`, () =>
    get(`https://web.archive.org/web/${ts}id_/https://www.basketball-reference.com/leagues/NBA_${season}_advanced.html`, 1500),
  );
  return { ts, rows: parse(html) };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** league.ts multiYearBpm, on the three seasons before `season`. */
function prior(id, pages) {
  const ws = [0.45, 0.35, 0.2];
  let num = 0, den = 0, total = 0;
  pages.forEach((p, k) => {
    const r = p.get(id);
    if (!r || !Number.isFinite(r.bpm)) return;
    const conf = clamp(r.mp / 1400, 0, 1);
    num += clamp(r.bpm, -12, 15) * ws[k] * conf;
    den += ws[k] * conf;
    total += r.mp;
  });
  if (den <= 0) return null;
  return { bpm: (num / den) * (total / (total + 350)), mp: total };
}

const finals = {};
for (const s of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
  finals[s] = await finalPage(s);
  console.log(`  NBA_${s} final: ${finals[s].size} players`);
}

/** id → overall pick, from a draft page. */
async function draftPage(year) {
  const html = await cached(`draft-${year}.html`, () => get(`https://www.basketball-reference.com/draft/NBA_${year}.html`, 3500));
  const $ = load(html.replace(/<!--/g, "").replace(/-->/g, ""));
  const out = new Map();
  $("table#stats tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const pick = Number($tr.find('[data-stat="pick_overall"]').first().text().trim());
    const href = $tr.find('[data-stat="player"] a').first().attr("href") || "";
    const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
    if (id && pick > 0) out.set(id, pick);
  });
  if (out.size < 40) throw new Error(`draft ${year}: only ${out.size} picks parsed`);
  return out;
}
const drafts = {};
for (const y of [2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
  drafts[y] = await draftPage(y);
  console.log(`  ${y} draft: ${drafts[y].size} picks`);
}
/** A rookie in `season`: drafted in one of the three drafts before it, with
 * no NBA row in the three seasons before. Returns his pick. */
function rookiePick(id, season, priorPages) {
  if (priorPages.some((p) => p.has(id))) return null;
  for (const y of [season - 1, season - 2, season - 3]) if (drafts[y]?.has(id)) return drafts[y].get(id);
  return null;
}

const samples = []; // { season, days, games, prior, early, mpEarly, rest, mpRest }
const rookieSamples = []; // the same, with `pick` and no prior yet
const cutoffs = [];
for (const season of Object.keys(OPENERS).map(Number)) {
  const priorPages = [finals[season - 1], finals[season - 2], finals[season - 3]];
  for (const days of CUTOFF_DAYS) {
    const { ts, rows } = await snapshot(season, days);
    const games = Math.max(...[...rows.values()].map((r) => r.g || 0));
    let n = 0;
    for (const [id, e] of rows) {
      const f = finals[season].get(id);
      const p = prior(id, priorPages);
      if (!f || !Number.isFinite(e.bpm) || !Number.isFinite(f.bpm)) continue;
      const mpRest = f.mp - e.mp;
      if (mpRest < 200 || e.mp <= 0) continue;
      const rest = (f.bpm * f.mp - e.bpm * e.mp) / mpRest;
      if (!p) {
        const pick = rookiePick(id, season, priorPages);
        if (pick) rookieSamples.push({ id, season, days, games, pick, early: clamp(e.bpm, -12, 15), mpEarly: e.mp, rest, mpRest });
        continue;
      }
      samples.push({ season, days, games, prior: p.bpm, early: clamp(e.bpm, -12, 15), mpEarly: e.mp, rest, mpRest });
      n++;
    }
    cutoffs.push({ season, days, snapshot: ts.slice(0, 8), games, players: n });
    console.log(`  ${season} +${days}d (${ts.slice(0, 8)}, ~${games} games): ${n} players`);
  }
}

/** Minutes-weighted RMSE of the rest of the season at prior weight M. */
function rmse(rows, M) {
  let se = 0, w = 0;
  for (const r of rows) {
    const pred = M === Infinity ? r.prior : (r.prior * M + r.early * r.mpEarly) / (M + r.mpEarly);
    se += r.mpRest * (pred - r.rest) ** 2;
    w += r.mpRest;
  }
  return Math.sqrt(se / w);
}
const GRID = [];
for (let m = 0; m <= 6000; m += 25) GRID.push(m);
for (let m = 6500; m <= 40000; m += 500) GRID.push(m);
function fit(rows) {
  let best = { M: 0, rmse: Infinity };
  for (const M of GRID) {
    const e = rmse(rows, M);
    if (e < best.rmse) best = { M, rmse: e };
  }
  return { M: best.M, rmse: +best.rmse.toFixed(4), priorOnly: +rmse(rows, Infinity).toFixed(4), seasonOnly: +rmse(rows, 0).toFixed(4), n: rows.length };
}

const pooled = fit(samples);
const byCutoff = CUTOFF_DAYS.map((days) => {
  const rows = samples.filter((r) => r.days === days);
  const games = Math.round(rows.reduce((s, r) => s + r.games, 0) / rows.length);
  return { days, games, ...fit(rows), atPooledM: +rmse(rows, pooled.M).toFixed(4) };
});
const bySeason = Object.keys(OPENERS).map(Number).map((season) => ({ season, ...fit(samples.filter((r) => r.season === season)) }));

// Leave-one-season-out: fit M on four seasons, score the fifth. The honest
// number for "does this help on a season it hasn't seen".
const loso = bySeason.map(({ season }) => {
  const train = samples.filter((r) => r.season !== season);
  const test = samples.filter((r) => r.season === season);
  const M = fit(train).M;
  return { season, M, rmse: +rmse(test, M).toFixed(4), priorOnly: +rmse(test, Infinity).toFixed(4) };
});

// Does the prior itself need rescaling? Minutes-weighted slope of rest on prior.
let sx = 0, sy = 0, sxx = 0, sxy = 0, sw = 0;
for (const r of samples) { sw += r.mpRest; sx += r.mpRest * r.prior; sy += r.mpRest * r.rest; sxx += r.mpRest * r.prior ** 2; sxy += r.mpRest * r.prior * r.rest; }
const priorSlope = (sxy - (sx * sy) / sw) / (sxx - (sx * sx) / sw);

/* ---- Rookies ---- */
// What draft slot said about a rookie season, from the other classes: a
// minutes-weighted line of full-season BPM on ln(pick), rookies with 200+
// minutes.
function slotCurve(exceptSeason) {
  let w = 0, x = 0, y = 0, xx = 0, xy = 0, n = 0;
  for (const season of Object.keys(OPENERS).map(Number)) {
    if (season === exceptSeason) continue;
    const priorPages = [finals[season - 1], finals[season - 2], finals[season - 3]];
    for (const [id, f] of finals[season]) {
      const pick = rookiePick(id, season, priorPages);
      if (!pick || !Number.isFinite(f.bpm) || f.mp < 200) continue;
      const lx = Math.log(pick), b = clamp(f.bpm, -12, 15);
      w += f.mp; x += f.mp * lx; y += f.mp * b; xx += f.mp * lx * lx; xy += f.mp * lx * b; n++;
    }
  }
  const slope = (xy - (x * y) / w) / (xx - (x * x) / w);
  return { intercept: +(y / w - slope * (x / w)).toFixed(3), slope: +slope.toFixed(3), n };
}
const curves = Object.fromEntries(Object.keys(OPENERS).map((s) => [s, slotCurve(Number(s))]));
for (const r of rookieSamples) r.prior = curves[r.season].intercept + curves[r.season].slope * Math.log(r.pick);
const rookiePooled = fit(rookieSamples);
const rookies = {
  note: "Prior is draft slot alone (a + b·ln(pick), fitted on the other four classes). The board's projection also reads college production, so its prior is somewhat better and this M is, if anything, low.",
  players: new Set(rookieSamples.map((r) => `${r.season}:${r.id}`)).size,
  // The weight the board uses, and the error at it. `pooled.M` is the fit.
  priorMinutes: ROOKIE_PRIOR_MINUTES,
  atPriorMinutes: +rmse(rookieSamples, ROOKIE_PRIOR_MINUTES).toFixed(4),
  pooled: rookiePooled,
  atVeteranM: +rmse(rookieSamples, pooled.M).toFixed(4),
  // The error is flat near its low point; this is how flat.
  curve: [250, 400, 525, 650, 750, 875, 1025, 1500].map((M) => ({ M, rmse: +rmse(rookieSamples, M).toFixed(4) })),
  byCutoff: CUTOFF_DAYS.map((days) => {
    const rows = rookieSamples.filter((r) => r.days === days);
    return { days, ...fit(rows), atVeteranM: +rmse(rows, pooled.M).toFixed(4), atRookieM: +rmse(rows, rookiePooled.M).toFixed(4) };
  }),
  leaveOneSeasonOut: Object.keys(OPENERS).map(Number).map((season) => {
    const test = rookieSamples.filter((r) => r.season === season);
    const M = fit(rookieSamples.filter((r) => r.season !== season)).M;
    return {
      season, M, n: test.length, rmse: +rmse(test, M).toFixed(4),
      atPriorMinutes: +rmse(test, ROOKIE_PRIOR_MINUTES).toFixed(4),
      atVeteranM: +rmse(test, pooled.M).toFixed(4),
      priorOnly: +rmse(test, Infinity).toFixed(4),
    };
  }),
  slotCurve: slotCurve(null),
};

const result = {
  source: "Basketball-Reference advanced pages: final (bref) and season-to-date (Wayback Machine snapshots)",
  asOf: localToday(),
  seasons: Object.keys(OPENERS).map((s) => `${Number(s) - 1}-${String(Number(s) % 100).padStart(2, "0")}`),
  method: "pred = (prior·M + early·mp) / (M + mp); M minimizes rest-of-season BPM error weighted by rest-of-season minutes",
  priorMinutes: pooled.M,
  pooled,
  byCutoff,
  bySeason,
  leaveOneSeasonOut: loso,
  priorSlope: +priorSlope.toFixed(3),
  rookies,
  cutoffs,
};
writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(`\nM (prior worth this many minutes): ${pooled.M}`);
console.log(`pooled RMSE: prior only ${pooled.priorOnly} → blended ${pooled.rmse} (season only ${pooled.seasonOnly}), n=${pooled.n}`);
for (const c of byCutoff) console.log(`  ~${String(c.games).padStart(2)} games: best M ${c.M}, prior-only ${c.priorOnly} → at pooled M ${c.atPooledM} (own best ${c.rmse}), n=${c.n}`);
for (const s of bySeason) console.log(`  ${s.season}: best M ${s.M}`);
for (const l of loso) console.log(`  LOSO ${l.season}: M ${l.M}, prior-only ${l.priorOnly} → ${l.rmse}`);
console.log(`  slope of rest-of-season BPM on the prior: ${priorSlope.toFixed(3)}`);
console.log(`\nRookies (${rookies.players} rookie seasons, n=${rookiePooled.n}): fit M ${rookiePooled.M}, board uses ${ROOKIE_PRIOR_MINUTES}`);
console.log(`  RMSE: slot only ${rookiePooled.priorOnly} → at veterans' M ${rookies.atVeteranM} → at ${ROOKIE_PRIOR_MINUTES} ${rookies.atPriorMinutes} → at the fit ${rookiePooled.rmse} (season only ${rookiePooled.seasonOnly})`);
for (const c of rookies.byCutoff) console.log(`  +${c.days}d: best M ${c.M}, slot only ${c.priorOnly}, veterans' M ${c.atVeteranM}, rookie M ${c.atRookieM}, n=${c.n}`);
for (const l of rookies.leaveOneSeasonOut) console.log(`  LOSO ${l.season}: slot only ${l.priorOnly}, veterans' M ${l.atVeteranM}, at ${ROOKIE_PRIOR_MINUTES} ${l.atPriorMinutes}, at its own fit (M ${l.M}) ${l.rmse} (n=${l.n})`);
console.log(`  curve: ${rookies.curve.map((c) => `${c.M}: ${c.rmse}`).join(", ")}`);
console.log(`  slot curve: ${rookies.slotCurve.intercept} + ${rookies.slotCurve.slope}·ln(pick)`);
console.log(`Wrote ${OUT}`);

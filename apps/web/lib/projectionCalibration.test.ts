import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Contract } from "@apron/cba-engine";
import { TEAM_CALIBRATION } from "@apron/data";
import {
  allocateRotation, teamDimensions, teamFit, eligiblePositions, positionSharesOf,
  type SeasonCtx,
} from "@/lib/league";

// ---------------------------------------------------------------------------
// THE PROJECTION CALIBRATION, RE-DERIVED.
//
// The shipped model is projNrtg = nrtgSpread × (talentZ·z(talent) + perdZ·z(perd)).
// This rebuilds the evidence for it from scratch every test run, so nobody has
// to take the constants in team-strength-2026.json on faith.
//
// 240 team-seasons (2018-19 … 2025-26). Features for season Y come only from
// Y-1 and Y-2 — no performance from the season being predicted enters any
// input. Rosters are Y's real rosters, which is the product's own starting
// condition, not a leak. Scored by leave-one-SEASON-out CV, so the fit never
// trains on the year it is grading.
//
// Crucially the features run through the SAME allocateRotation and
// teamDimensions the board uses, via an injected SeasonCtx — not a
// reimplementation that could quietly disagree with production.
//
// Refresh the inputs with:
//   node packages/data/scripts/scrape-history-stats.mjs 2017 … 2026
// ---------------------------------------------------------------------------

type Dim = { off: number; def: number; play: number; reb: number; space: number; rim: number; perd: number; usg: number };
type Stat = { mp?: number; mpg?: number; bpm?: number; team?: string; age?: number };
const H = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "packages", "data", "src", "player-stats-history.json"), "utf8"),
) as { bySeason: Record<string, { stats: Record<string, Stat>; dims: Record<string, Dim>; teams: Record<string, { nrtg: number }> }> };

const TARGETS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
const BPM_TO_AV = 3.6;
const REPLACEMENT_AV = 44;
const MAX_MIN = 3020;
const LEAGUE_DIM: Dim = { off: 50, def: 50, play: 42, reb: 45, space: 46, rim: 32, perd: 48, usg: 16 };
const BR: Record<string, string> = { PHO: "PHX", BRK: "BKN", CHO: "CHA" };
const std = (a: string) => BR[a] ?? a;

function priorForm(id: string, year: string) {
  const seasons = [
    { s: H.bySeason[String(+year - 1)]?.stats[id], d: H.bySeason[String(+year - 1)]?.dims[id], w: 0.65 },
    { s: H.bySeason[String(+year - 2)]?.stats[id], d: H.bySeason[String(+year - 2)]?.dims[id], w: 0.35 },
  ].filter((x) => x.s && Number.isFinite(x.s.bpm) && (x.s.mp ?? 0) > 200);
  if (!seasons.length) return { av: REPLACEMENT_AV, mpg: 12, d: LEAGUE_DIM, age: 23 };
  const ws = seasons.reduce((t, x) => t + x.w, 0);
  const bpm = seasons.reduce((t, x) => t + x.s!.bpm! * x.w, 0) / ws;
  const mp = seasons.reduce((t, x) => t + (x.s!.mp ?? 0) * x.w, 0) / ws;
  return {
    av: REPLACEMENT_AV + (50 + BPM_TO_AV * bpm - REPLACEMENT_AV) * Math.min(1, mp / 1200),
    mpg: seasons[0]!.s!.mpg ?? 20,
    d: seasons[0]!.d ?? LEAGUE_DIM,
    age: (seasons[0]!.s!.age ?? 26) + 1,
  };
}

/** A historical season, expressed for the production rotation code. */
function ctxFor(year: string): SeasonCtx {
  const cache = new Map<string, ReturnType<typeof priorForm>>();
  const form = (id: string) => {
    let f = cache.get(id);
    if (!f) { f = priorForm(id, year); cache.set(id, f); }
    return f;
  };
  return {
    salary: () => 1, // historical rosters carry no cap sheet; membership is the filter
    av: (c) => form(c.playerId).av,
    minutes: (c) => Math.min(MAX_MIN, form(c.playerId).mpg * 82),
    positions: (id) => { const p = eligiblePositions(id); return p.length ? p : ["SF", "PF", "SG"]; },
    shares: (id) => positionSharesOf(id),
    age: (id) => form(id).age,
    dims: (c) => form(c.playerId).d as never,
  };
}

type Row = { season: string; y: number; f: Record<string, number> };
const ROWS: Row[] = [];
for (const y of TARGETS) {
  const ctx = ctxFor(y);
  for (const [abbr, t] of Object.entries(H.bySeason[y]!.teams)) {
    if (!Number.isFinite(t.nrtg)) continue;
    const team = std(abbr);
    const roster = Object.entries(H.bySeason[y]!.stats)
      .filter(([, s]) => s.team && std(s.team) === team)
      .map(([id]) => ({ playerId: id, playerName: id, teamId: team, years: [] }) as unknown as Contract);
    ROWS.push({
      season: y, y: t.nrtg,
      f: { talent: allocateRotation(roster, ctx).score, perd: teamDimensions(roster, ctx).perd, fit: teamFit(roster, ctx).nrtg },
    });
  }
}

/** Features standardized within their own season — the scale-free form, so
 *  coefficients mean the same thing in the calibration and on the live board. */
function zRows(keys: string[]): Row[] {
  const out: Row[] = [];
  for (const season of TARGETS) {
    const rows = ROWS.filter((r) => r.season === season);
    const st: Record<string, { m: number; sd: number }> = {};
    for (const k of keys) {
      const v = rows.map((r) => r.f[k]!);
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      st[k] = { m, sd: Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1 };
    }
    for (const r of rows) out.push({ ...r, f: Object.fromEntries(keys.map((k) => [k, (r.f[k]! - st[k]!.m) / st[k]!.sd])) });
  }
  return out;
}

function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) A[i]![j] = X.reduce((s, r) => s + r[i]! * r[j]!, 0);
    b[i] = X.reduce((s, r, t) => s + r[i]! * y[t]!, 0);
  }
  for (let i = 0; i < k; i++) {
    let p = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r]![i]!) > Math.abs(A[p]![i]!)) p = r;
    [A[i], A[p]] = [A[p]!, A[i]!]; [b[i], b[p]] = [b[p]!, b[i]!];
    for (let r = i + 1; r < k; r++) {
      const f = A[r]![i]! / A[i]![i]!;
      for (let c = i; c < k; c++) A[r]![c]! -= f * A[i]![c]!;
      b[r]! -= f * b[i]!;
    }
  }
  const coef = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let j = i + 1; j < k; j++) s -= A[i]![j]! * coef[j]!;
    coef[i] = s / A[i]![i]!;
  }
  return coef;
}

/** Leave-one-season-out CV plus the full-sample coefficients. */
function evaluate(keys: string[]) {
  const rows = zRows(keys);
  const design = (rs: Row[]) => rs.map((r) => [1, ...keys.map((k) => r.f[k]!)]);
  const errs: number[] = [];
  for (const held of TARGETS) {
    const tr = rows.filter((r) => r.season !== held);
    const c = ols(design(tr), tr.map((r) => r.y));
    for (const r of rows.filter((x) => x.season === held))
      errs.push((r.y - c.reduce((s, cc, j) => s + cc * (j === 0 ? 1 : r.f[keys[j - 1]!]!), 0)) ** 2);
  }
  return { cv: Math.sqrt(errs.reduce((s, v) => s + v, 0) / errs.length), coef: ols(design(rows), rows.map((r) => r.y)) };
}

describe(`projection calibration, re-derived (n=${ROWS.length})`, () => {
  it("has the panel it claims to have", () => {
    expect(ROWS.length).toBe(240);
    expect(TARGETS.length).toBe(8);
  });

  it("the shipped coefficients are what this data produces", () => {
    const { coef, cv } = evaluate(["talent", "perd"]);
    console.log(`\n  re-derived: nrtg = ${coef[1]!.toFixed(3)}·z(talent) + ${coef[2]!.toFixed(3)}·z(perd)   CV-RMSE ${cv.toFixed(3)}`);
    console.log(`  shipped   : nrtg = ${TEAM_CALIBRATION.talentZ.toFixed(3)}·z(talent) + ${TEAM_CALIBRATION.perdZ.toFixed(3)}·z(perd)   CV-RMSE ${TEAM_CALIBRATION.cvRmseNrtg?.toFixed(3)}`);
    expect(coef[1]!).toBeCloseTo(TEAM_CALIBRATION.talentZ, 1);
    expect(coef[2]!).toBeCloseTo(TEAM_CALIBRATION.perdZ, 1);
    expect(cv).toBeCloseTo(TEAM_CALIBRATION.cvRmseNrtg!, 1);
  });

  it("perimeter defense earns its place; team fit does not", () => {
    const talentOnly = evaluate(["talent"]).cv;
    const withPerd = evaluate(["talent", "perd"]).cv;
    const withFit = evaluate(["talent", "fit"]).cv;
    console.log(
      `\n  talent alone ${talentOnly.toFixed(3)} | + perd ${withPerd.toFixed(3)} | + fit ${withFit.toFixed(3)}`,
    );
    // perd genuinely helps out of sample…
    expect(withPerd).toBeLessThan(talentOnly - 0.05);
    // …and the old fit term does not. This is the finding that retired it from
    // the prediction; if it ever starts earning its keep, this fails loudly.
    expect(Math.abs(withFit - talentOnly)).toBeLessThan(0.05);
  });

  it("the variance match targets the real spread of team net ratings", () => {
    const all = TARGETS.flatMap((y) => Object.values(H.bySeason[y]!.teams).map((t) => t.nrtg)).filter(Number.isFinite);
    const m = all.reduce((s, x) => s + x, 0) / all.length;
    const sd = Math.sqrt(all.reduce((s, x) => s + (x - m) ** 2, 0) / all.length);
    const { coef } = evaluate(["talent", "perd"]);
    const rows = zRows(["talent", "perd"]);
    const pred = rows.map((r) => coef[1]! * r.f.talent! + coef[2]! * r.f.perd!);
    const pm = pred.reduce((s, x) => s + x, 0) / pred.length;
    const psd = Math.sqrt(pred.reduce((s, x) => s + (x - pm) ** 2, 0) / pred.length);
    console.log(`\n  real spread ${sd.toFixed(2)} | raw prediction spread ${psd.toFixed(2)} | implied ×${(sd / psd).toFixed(2)}`);
    expect(TEAM_CALIBRATION.nrtgSpread).toBeGreaterThan(1);
    expect(TEAM_CALIBRATION.nrtgSpread).toBeCloseTo(sd / psd, 0);
  });
});

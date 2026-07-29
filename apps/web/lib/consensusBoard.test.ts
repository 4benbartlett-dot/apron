import { describe, it, expect } from "vitest";
import type { Contract } from "@apron/cba-engine";
import { TEAM_CALIBRATION as CAL } from "@apron/data";
import {
  BASE_CONTRACTS, TEAM_IDS, allocateRotation, teamDimensions, adjustedAv, rosterNeed,
  teamProjection, normName, CURRENT_SEASON, type SeasonCtx,
} from "@/lib/league";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONS = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "packages", "data", "src", "player-consensus-2026.json"), "utf8"),
);

const nrm = (n: string) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[.'\u2019`-]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/\s+/g, " ").trim();

/* ---------------- the four-metric consensus, 2025-26 ---------------- */
type Row = Record<string, number | string | undefined>;
const BY = (CONS as { byName: Record<string, Row> }).byName;
const M: Record<string, Map<string, number>> = { epm: new Map(), darko: new Map(), lebron: new Map(), rapm: new Map() };
for (const [k, r] of Object.entries(BY)) for (const m of Object.keys(M)) {
  const v = r[m];
  if (typeof v === "number" && Number.isFinite(v)) M[m]!.set(k, v);
}
const zf = (m: Map<string, number>) => {
  const v = [...m.values()];
  const mu = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length) || 1;
  return (x: number) => (x - mu) / sd;
};
const Z = Object.fromEntries(Object.entries(M).map(([k, m]) => [k, zf(m)]));
const consensusZ = (name: string): number | null => {
  const vs = Object.entries(M).map(([k, m]) => {
    const v = m.get(nrm(name));
    return v == null ? null : Z[k]!(v);
  }).filter((x): x is number => x !== null);
  return vs.length >= 3 ? vs.reduce((s, x) => s + x, 0) / vs.length : null;
};

/* ---------------- our ratings, and the usage bias ---------------- */
const LIVE = BASE_CONTRACTS.filter((c) => !c.deadMoney);
const avOf = new Map<string, number>();
const usgOf = new Map<string, number>();
for (const c of LIVE) {
  avOf.set(c.playerId, adjustedAv(c));
  usgOf.set(c.playerId, CURRENT_SEASON.dims(c).usg);
}
const stat = (v: number[]) => {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return { m, sd: Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1 };
};
const AVS = stat([...avOf.values()]);
const USG = stat([...usgOf.values()]);

/** bias = (our z) − (consensus z), regressed on standardized usage. */
const pts: { bias: number; zu: number; name: string; id: string }[] = [];
for (const c of LIVE) {
  const cz = consensusZ(c.playerName);
  if (cz === null) continue;
  pts.push({
    bias: (avOf.get(c.playerId)! - AVS.m) / AVS.sd - cz,
    zu: (usgOf.get(c.playerId)! - USG.m) / USG.sd,
    name: c.playerName, id: c.playerId,
  });
}
const mzu = pts.reduce((s, p) => s + p.zu, 0) / pts.length;
const mb = pts.reduce((s, p) => s + p.bias, 0) / pts.length;
const B1 = pts.reduce((s, p) => s + (p.zu - mzu) * (p.bias - mb), 0) / pts.reduce((s, p) => s + (p.zu - mzu) ** 2, 0);
const B0 = mb - B1 * mzu;

/** (a) DISPERSION FIX — shrink our scale by the measured 1.29x over-spread.
 *  Monotonic and linear, so it preserves every player's rank exactly. */
const SHRINK = 0.776;
function shrunkAv(c: Contract): number {
  const av = avOf.get(c.playerId) ?? adjustedAv(c);
  return AVS.m + AVS.sd * SHRINK * ((av - AVS.m) / AVS.sd);
}
const SHRUNK: SeasonCtx = { ...CURRENT_SEASON, av: (c) => shrunkAv(c) };

/** (b) CONSENSUS — use the professional metrics AS the player rating, which is
 *  the only change that actually reorders players. Falls back to our own value
 *  for anyone the metrics don't cover (rookies, sub-500-minute players). */
let covered = 0, uncovered = 0;
function consensusAv(c: Contract): number {
  const cz = consensusZ(c.playerName);
  if (cz === null) { uncovered++; return avOf.get(c.playerId) ?? adjustedAv(c); }
  covered++;
  return AVS.m + AVS.sd * cz;
}
const CONSENSUS: SeasonCtx = { ...CURRENT_SEASON, av: (c) => consensusAv(c) };

/* ---------------- the standings pipeline, replicated for any ctx ---------------- */
function normFor(ctx: SeasonCtx) {
  const talent: number[] = [], perd: number[] = [];
  for (const t of TEAM_IDS) {
    const r = BASE_CONTRACTS.filter((c) => c.teamId === t && !c.deadMoney);
    talent.push(allocateRotation(r, ctx).score);
    perd.push(teamDimensions(r, ctx).perd);
  }
  return { talent: stat(talent), perd: stat(perd) };
}
function nrtgFor(roster: Contract[], ctx: SeasonCtx, n: ReturnType<typeof normFor>) {
  const D = teamDimensions(roster, ctx);
  const zt = (allocateRotation(roster, ctx).score - n.talent.m) / n.talent.sd;
  const zp = (D.perd - n.perd.m) / n.perd.sd;
  return CAL.nrtgSpread * (CAL.talentZ * zt + CAL.perdZ * zp) + rosterNeed(D).nrtg;
}
const rawWins = (n: number) => Math.max(0, Math.min(82, CAL.winsIntercept + CAL.winsPerNrtg * n));
function apportion(raw: number[], total: number) {
  const res = raw.map((w) => Math.floor(w));
  let rem = Math.round(total - res.reduce((a, b) => a + b, 0));
  const byFrac = raw.map((w, i) => ({ i, frac: w - Math.floor(w) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && k < byFrac.length; k++) if (res[byFrac[k]!.i]! < 82) { res[byFrac[k]!.i]!++; rem--; }
  for (let k = byFrac.length - 1; rem < 0 && k >= 0; k--) if (res[byFrac[k]!.i]! > 0) { res[byFrac[k]!.i]!--; rem++; }
  return res;
}
function standings(contracts: Contract[], ctx: SeasonCtx, n: ReturnType<typeof normFor>, baseTotal: number) {
  const raw = TEAM_IDS.map((t) => nrtgFor(contracts.filter((c) => c.teamId === t), ctx, n));
  const off = (baseTotal - raw.reduce((a, b) => a + b, 0)) / TEAM_IDS.length;
  const nrtgs = raw.map((x) => x + off);
  const wins = apportion(nrtgs.map(rawWins), 1230);
  return Object.fromEntries(TEAM_IDS.map((t, i) => [t, { nrtg: Math.round(nrtgs[i]! * 10) / 10, wins: wins[i]! }]));
}

const N_CUR = normFor(CURRENT_SEASON), N_SHR = normFor(SHRUNK), N_CON = normFor(CONSENSUS);
const BT_CUR = TEAM_IDS.reduce((s, t) => s + nrtgFor(BASE_CONTRACTS.filter((c) => c.teamId === t), CURRENT_SEASON, N_CUR), 0);
const BT_SHR = TEAM_IDS.reduce((s, t) => s + nrtgFor(BASE_CONTRACTS.filter((c) => c.teamId === t), SHRUNK, N_SHR), 0);
const BT_CON = TEAM_IDS.reduce((s, t) => s + nrtgFor(BASE_CONTRACTS.filter((c) => c.teamId === t), CONSENSUS, N_CON), 0);
const BASE_CUR = standings(BASE_CONTRACTS, CURRENT_SEASON, N_CUR, BT_CUR);
const BASE_SHR = standings(BASE_CONTRACTS, SHRUNK, N_SHR, BT_SHR);
const BASE_CON = standings(BASE_CONTRACTS, CONSENSUS, N_CON, BT_CON);

function deltaWins(name: string, ctx: SeasonCtx, n: ReturnType<typeof normFor>, bt: number, base: Record<string, { wins: number }>) {
  const p = LIVE.find((c) => normName(c.playerName) === normName(name))!;
  const out: Record<string, number> = {};
  for (const t of TEAM_IDS) {
    if (t === p.teamId) { out[t] = 0; continue; }
    const live = BASE_CONTRACTS.map((c) => (c.playerId === p.playerId && !c.deadMoney ? { ...c, teamId: t } : c));
    out[t] = standings(live, ctx, n, bt)[t]!.wins - base[t]!.wins;
  }
  return { from: p.teamId, out };
}

/** Which model of the bias actually explains it? */
function fitBias(xs: ((p: typeof pts[0]) => number)[]) {
  const X = pts.map((p) => [1, ...xs.map((f) => f(p))]);
  const y = pts.map((p) => p.bias);
  const k = X[0]!.length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) A[i]![j] = X.reduce((s, r) => s + r[i]! * r[j]!, 0);
    b[i] = X.reduce((s, r, t) => s + r[i]! * y[t]!, 0);
  }
  for (let i = 0; i < k; i++) {
    let pv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r]![i]!) > Math.abs(A[pv]![i]!)) pv = r;
    [A[i], A[pv]] = [A[pv]!, A[i]!]; [b[i], b[pv]] = [b[pv]!, b[i]!];
    for (let r = i + 1; r < k; r++) {
      const f = A[r]![i]! / A[i]![i]!;
      for (let c = i; c < k; c++) A[r]![c]! -= f * A[i]![c]!;
      b[r]! -= f * b[i]!;
    }
  }
  const co = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) { let sm = b[i]!; for (let j = i + 1; j < k; j++) sm -= A[i]![j]! * co[j]!; co[i] = sm / A[i]![i]!; }
  const my = y.reduce((s, x) => s + x, 0) / y.length;
  const ssr = y.reduce((s, yy, t) => s + (yy - X[t]!.reduce((a, xv, j) => a + xv * co[j]!, 0)) ** 2, 0);
  const sst = y.reduce((s, yy) => s + (yy - my) ** 2, 0);
  return { co, r2: 1 - ssr / sst };
}
const ourZof = (p: typeof pts[0]) => (avOf.get(p.id)! - AVS.m) / AVS.sd;

describe("current model vs usage-debiased model", () => {
  it("finds what actually explains the star bias", () => {
    const a = fitBias([(p) => p.zu]);
    const b = fitBias([ourZof]);
    const c = fitBias([ourZof, (p) => p.zu]);
    console.log(`\n  WHAT EXPLAINS OUR OVERRATING? (bias = our z − consensus z, n=${pts.length})`);
    console.log(`   usage only          bias = ${a.co[0]!.toFixed(3)} + ${a.co[1]!.toFixed(3)}·z(usg)                R² ${a.r2.toFixed(3)}`);
    console.log(`   our own rating      bias = ${b.co[0]!.toFixed(3)} + ${b.co[1]!.toFixed(3)}·z(ours)               R² ${b.r2.toFixed(3)}`);
    console.log(`   both                bias = ${c.co[0]!.toFixed(3)} + ${c.co[1]!.toFixed(3)}·z(ours) + ${c.co[2]!.toFixed(3)}·z(usg)   R² ${c.r2.toFixed(3)}`);
    console.log(`\n   implied: consensus z ≈ ${(1 - b.co[1]!).toFixed(3)}·(our z) − ${b.co[0]!.toFixed(3)}  → we are OVER-DISPERSED by ${(1 / (1 - b.co[1]!)).toFixed(2)}×`);
  });

  it("the replicated baseline reproduces teamProjection exactly", () => {
    for (const t of TEAM_IDS) expect(BASE_CUR[t]!.wins).toBe(teamProjection(t, BASE_CONTRACTS)!.baseWins);
  });

  it("full standings and trade impact under each model", () => {
    console.log(`\n  consensus covers ${covered} of ${covered + uncovered} rostered players; the rest keep our value`);

    console.log(`\n  ── FULL STANDINGS ──`);
    console.log(`         CURRENT        DISPERSION-FIXED     CONSENSUS-RATED`);
    const rank = (b: Record<string, { wins: number }>) => [...TEAM_IDS].sort((x, y) => b[y]!.wins - b[x]!.wins);
    const rCur = rank(BASE_CUR), rShr = rank(BASE_SHR), rCon = rank(BASE_CON);
    for (const [i, t] of rCur.entries()) {
      const js = rShr.indexOf(t), jc = rCon.indexOf(t);
      const mv = (j: number) => (i === j ? "  —" : i > j ? `▲${i - j}` : `▼${j - i}`);
      console.log(`   ${String(i + 1).padStart(2)}. ${t.padEnd(4)} ${String(BASE_CUR[t]!.wins).padStart(2)}W ${String(BASE_CUR[t]!.nrtg).padStart(6)}   #${String(js + 1).padStart(2)} ${String(BASE_SHR[t]!.wins).padStart(2)}W ${mv(js)}      #${String(jc + 1).padStart(2)} ${String(BASE_CON[t]!.wins).padStart(2)}W ${String(BASE_CON[t]!.nrtg).padStart(6)} ${mv(jc)}`);
    }
    const shifts = TEAM_IDS.map((t) => Math.abs(BASE_CUR[t]!.wins - BASE_SHR[t]!.wins));
    console.log(`\n   dispersion fix: biggest win change anywhere = ${Math.max(...shifts)}  (z-scoring makes the model invariant to linear rescaling)`);
    const cs = TEAM_IDS.map((t) => Math.abs(BASE_CUR[t]!.wins - BASE_CON[t]!.wins));
    console.log(`   consensus:      biggest win change anywhere = ${Math.max(...cs)}, mean ${(cs.reduce((a, b) => a + b, 0) / 30).toFixed(1)}`);

    for (const name of ["Stephen Curry", "Rudy Gobert"]) {
      const a = deltaWins(name, CURRENT_SEASON, N_CUR, BT_CUR, BASE_CUR);
      const c = deltaWins(name, CONSENSUS, N_CON, BT_CON, BASE_CON);
      console.log(`\n  ── TRADING FOR ${name.toUpperCase()} (from ${a.from}) — wins added ──`);
      console.log(`   team   current  consensus   diff`);
      for (const t of TEAM_IDS.filter((x) => x !== a.from).sort((x, y) => a.out[y]! - a.out[x]!)) {
        const d = c.out[t]! - a.out[t]!;
        console.log(`   ${t.padEnd(5)}  ${String((a.out[t]! >= 0 ? "+" : "") + a.out[t]!).padEnd(8)} ${String((c.out[t]! >= 0 ? "+" : "") + c.out[t]!).padEnd(10)} ${d === 0 ? "" : (d > 0 ? "+" : "") + d}`);
      }
      const mean = (o: Record<string, number>) => (TEAM_IDS.filter((t) => t !== a.from).reduce((s, t) => s + o[t]!, 0) / 29).toFixed(2);
      console.log(`   league-average gain: current ${mean(a.out)}  consensus ${mean(c.out)}`);
    }
  });
});

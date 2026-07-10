"use client";

import { leagueToast } from "@/components/SiteEggs";
import type { Move } from "@/lib/league";

/** Team easter eggs — design-preview tranche (branch: eggs/team-easter-eggs).
 *
 * Three eggs, three shapes:
 *  - MIA · Heat Culture   — mechanic-tied toast (fires on the minimum exception)
 *  - SAC · Light the Beam — physical board effect (fires on projection gains)
 *  - PHX · Tumbleweed     — team-page ambient scene (lives in Tumbleweed.tsx)
 *
 * Mock notes: these fire every time their trigger hits (no once-per-session
 * throttle yet — easier to demo). Production would remember benchmark-style
 * eggs in localStorage so they land once, like a real gag.
 */

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- The league-office queue -------------------------------------------
 * One move can set off several teams at once (a blockbuster that sends a star
 * to one board card and a first-rounder to another). Rather than dogpile the
 * screen, their reactions PLAY IN SEQUENCE — each gets its own moment, like
 * the league office stamping one consequence, then the next. The first runs
 * immediately; the rest wait their turn behind a short breath. A card that
 * has since left the board just no-ops when its turn comes. */
type QueuedEgg = { key: string; ms: number; run: () => void };
let eggQueue: QueuedEgg[] = [];
let eggDraining = false;
const EGG_GAP = 480;
const EGG_QUEUE_MAX = 4;

/* Cooldowns keep the surprises surprising: the narrative one-timers play
 * once per session, the repeatable spectacles rest ten minutes between
 * shows. (The 101st Blow throttles itself — it IS the 5th move.) */
const EGG_POLICY: Record<string, "once" | number> = {
  intro: "once",
  chalk: "once",
  confetti: "once",
  beam: 10 * 60_000,
  strike: 10 * 60_000,
  subway: 10 * 60_000,
};
function eggAllowed(key: string): boolean {
  const policy = EGG_POLICY[key];
  if (!policy) return true;
  try {
    const k = `apron_egg_seen:${key}`;
    const raw = sessionStorage.getItem(k);
    if (policy === "once") return !raw;
    return !raw || Date.now() - Number(raw) >= policy;
  } catch {
    return true;
  }
}
function markEggSeen(key: string) {
  if (!EGG_POLICY[key]) return;
  try {
    sessionStorage.setItem(`apron_egg_seen:${key}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function queueEgg(key: string, ms: number, run: () => void) {
  // De-dupe within a batch; cap the parade so a wild multi-team deal can't
  // hold the screen hostage (extra reactions are all good news — losing the
  // 5th is fine). Cooldowns apply before anything is queued.
  if (!eggAllowed(key)) return;
  if (eggQueue.some((e) => e.key === key) || eggQueue.length >= EGG_QUEUE_MAX) return;
  markEggSeen(key);
  eggQueue.push({ key, ms, run });
  if (!eggDraining) drainEggQueue();
}
function drainEggQueue() {
  const next = eggQueue.shift();
  if (!next) {
    eggDraining = false;
    return;
  }
  eggDraining = true;
  try {
    next.run();
  } catch {
    /* a dead card / torn-down view just no-ops */
  }
  // Reduced motion collapses each egg to its toast — sequence those at a
  // readable clip instead of waiting out an animation that never plays.
  setTimeout(drainEggQueue, (reducedMotion() ? 2400 : next.ms) + EGG_GAP);
}

/** MIA — signing anyone to the MINIMUM is the most Miami transaction there is. */
export function heatCultureEgg(teamId: string, mechanismId: string | undefined | null) {
  if (teamId !== "MIA" || mechanismId !== "minimum") return;
  leagueToast("Heat culture", "He'll be in the best shape of his life by camp.", "heat");
}

/** Did this move involve the team at all? (Sends without receives still change
 * the projection — the beam only fires on gains, so erring loose is safe.) */
export function moveTouches(m: Move, team: string): boolean {
  switch (m.kind) {
    case "trade":
      return (
        m.players.some((p) => p.to === team) ||
        (m.picks ?? []).some((p) => p.to === team || p.from === team) ||
        (m.pickSwaps ?? []).some((s) => s.favoredTo === team || s.otherTeam === team)
      );
    case "sign":
      return m.teamId === team;
    case "sign_trade":
      return m.toTeam === team || m.fromTeam === team;
    case "renounce":
      return m.team === team;
    default:
      // extend/waive carry no team id — let the projection delta decide.
      return true;
  }
}

/** Board-card lookup + a decaying shake applied to the card itself. */
function cardOf(team: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-egg-team="${team}"]`);
}
function shake(card: HTMLElement, cls: "egg-shudder" | "egg-rumble", ms: number) {
  card.classList.add(cls);
  setTimeout(() => card.classList.remove(cls), ms);
}

/** OKC — The Strike. Another first enters the vault: the room dims for a
 * blink, a jagged bolt cracks from the top of the screen into the card with
 * a white flash, and the card shudders while the thunder rolls off. Instant
 * and violent where the beam is sustained and serene. */
export function strikeEgg(firstCount: number) {
  queueEgg("strike", 2000, () => strikeEggRun(firstCount));
}
function strikeEggRun(firstCount: number) {
  leagueToast("Filed", `That's ${firstCount} future first${firstCount === 1 ? "" : "s"}. Sam says thank you for calling.`);
  if (reducedMotion()) return;
  const card = cardOf("OKC");
  if (!card || document.querySelector(".egg-strike")) return;
  const r = card.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const h = Math.max(r.top + 6, 90);
  // hand-jagged path from the sky to the card top, kinking back to center
  let d = `M ${x.toFixed(1)} 0`;
  const segs = 8;
  for (let i = 1; i <= segs; i++) {
    const y = (h / segs) * i;
    const cx = i === segs ? x : x + (i % 2 ? -1 : 1) * (7 + ((i * 11) % 20));
    d += ` L ${cx.toFixed(1)} ${y.toFixed(1)}`;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-strike";
  wrap.innerHTML =
    '<i class="st-dim"></i>' +
    `<svg class="st-bolt" width="${window.innerWidth}" height="${h}" viewBox="0 0 ${window.innerWidth} ${h}" fill="none">` +
    `<path d="${d}" stroke="#f2ecff" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${d}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>` +
    `<i class="st-flash" style="left:${x}px;top:${r.top}px"></i>`;
  document.body.appendChild(wrap);
  shake(card, "egg-shudder", 1400);
  setTimeout(() => wrap.remove(), 1900);
}

/** CHI — The Intro. A star arrives: the lights go DOWN and one spotlight
 * hunts the board — drifting slowly, pausing on the wrong teams the way a
 * real arena spotlight does — before finding and tightening on the player's
 * own roster row. The toast waits for the light to land. */
export function introEgg(playerName: string) {
  queueEgg("intro", 5200, () => introEggRun(playerName));
}
function introEggRun(playerName: string) {
  if (reducedMotion()) {
    leagueToast("And now…", `${playerName}. From parts elsewhere. Your newest Bull.`);
    return;
  }
  const card = cardOf("CHI");
  if (!card || document.querySelector(".egg-intro")) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // the player's own row inside the Bulls card — the innermost element that
  // names him and is row-sized. Falls back to the card header.
  const inView = (rc: DOMRect) => rc.top > 40 && rc.bottom < vh - 20;
  const row = [...card.querySelectorAll<HTMLElement>("div, span")]
    .filter((e) => (e.textContent || "").includes(playerName))
    .map((e) => ({ e, rc: e.getBoundingClientRect() }))
    .filter(({ rc }) => rc.height > 8 && rc.height < 56 && rc.width > 60)
    .sort((a, b) => a.rc.width * a.rc.height - b.rc.width * b.rc.height)[0];
  const cr = card.getBoundingClientRect();
  const target =
    row && inView(row.rc)
      ? { x: row.rc.left + row.rc.width / 2, y: row.rc.top + row.rc.height / 2 }
      : { x: cr.left + cr.width / 2, y: cr.top + Math.min(cr.height * 0.25, 150) };
  // the hunt visits the OTHER front offices first
  const others = [...document.querySelectorAll<HTMLElement>("[data-egg-team]")]
    .filter((c) => c.dataset.eggTeam !== "CHI")
    .map((c) => c.getBoundingClientRect())
    .filter((rc) => rc.top < vh && rc.bottom > 0)
    .slice(0, 2);
  const w1 = others[0]
    ? { x: others[0].left + others[0].width / 2, y: Math.max(others[0].top + 130, 120) }
    : { x: vw * 0.78, y: vh * 0.3 };
  const w2 = others[1]
    ? { x: others[1].left + others[1].width / 2, y: Math.max(others[1].top + 170, 160) }
    : { x: vw * 0.24, y: vh * 0.6 };
  const spot = 320; // roaming diameter; the landing iris tightens via scale
  const pt = (p: { x: number; y: number }) => `${(p.x - spot / 2).toFixed(0)}px, ${(p.y - spot / 2).toFixed(0)}px`;
  const wrap = document.createElement("div");
  wrap.className = "egg-intro";
  wrap.style.setProperty("--p0", pt({ x: vw * 0.12, y: -60 }));
  wrap.style.setProperty("--p1", pt(w1));
  wrap.style.setProperty("--p2", pt(w2));
  wrap.style.setProperty("--pf", pt(target));
  wrap.innerHTML = '<i class="in-spot"></i>';
  document.body.appendChild(wrap);
  // the PA waits until the light finds him
  setTimeout(() => leagueToast("And now…", `${playerName}. From parts elsewhere. Your newest Bull.`), 4100);
  setTimeout(() => wrap.remove(), 5700);
}

/** LAL — Seventeen-and-Counting. A max player arrives via trade: purple and
 * gold confetti pours over the Lakers card only, and a small pennant rises
 * to the rafters (the card's top edge). */
export function confettiEgg() {
  queueEgg("confetti", 3400, () => confettiEggRun());
}
function confettiEggRun() {
  leagueToast("As foretold", "The Lakers always get their guy. It's in the CBA somewhere. (It isn't.)");
  if (reducedMotion()) return;
  const card = cardOf("LAL");
  if (!card || document.querySelector(".egg-confetti")) return;
  const r = card.getBoundingClientRect();
  const wrap = document.createElement("div");
  wrap.className = "egg-confetti";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top - 30}px`;
  wrap.style.width = `${r.width}px`;
  wrap.style.height = `${Math.min(r.height, 460) + 30}px`;
  wrap.style.setProperty("--fall", `${Math.min(r.height, 460)}px`);
  const colors = ["color-mix(in srgb, #552583 72%, var(--text))", "#fdb927", "color-mix(in srgb, #f4f1e9 58%, var(--text))"];
  let pieces = "";
  for (let i = 0; i < 60; i++) {
    const left = (i * 61) % 100;
    const delay = (i * 53) % 1100;
    const drift = ((i * 13) % 44) - 22;
    const spin = i % 2 ? 1 : -1;
    const w = 5 + (i % 3);
    const hgt = 8 + (i % 4);
    pieces += `<i style="left:${left}%;animation-delay:${delay}ms;--cfd:${drift}px;--cfs:${spin};width:${w}px;height:${hgt}px;background:${colors[i % 3]}"></i>`;
  }
  wrap.innerHTML = pieces + '<b class="cf-banner"></b>';
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4400);
}

/** SAS — The 101st Blow. The Spurs' fifth move of the session: a hairline
 * crack draws across the card, pauses… then splits with a flash and dust
 * before healing. Persistence, rewarded — per the stonecutter. */
export function rockCrackEgg() {
  queueEgg("crack", 3000, () => rockCrackEggRun());
}
function rockCrackEggRun() {
  leagueToast("Pound the rock", "That was the hundred-and-first blow.");
  if (reducedMotion()) return;
  const card = cardOf("SAS");
  if (!card || document.querySelector(".egg-crack")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  const midY = Math.min(r.height, 420) * 0.45;
  let d = `M 0 ${midY.toFixed(1)}`;
  const segs = 10;
  for (let i = 1; i <= segs; i++) {
    const px = (w / segs) * i;
    const py = midY + (i % 2 ? -1 : 1) * (4 + ((i * 7) % 14));
    d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-crack";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${Math.min(r.height, 420)}px`;
  wrap.innerHTML =
    `<svg width="${w}" height="${Math.min(r.height, 420)}" fill="none">` +
    `<path class="ck-line" d="${d}" stroke="#4a4234" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path class="ck-glow" d="${d}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>` +
    '<i class="ck-dust" style="left:6%"></i><i class="ck-dust" style="left:88%"></i>';
  document.body.appendChild(wrap);
  // the split lands after the hairline finishes drawing
  setTimeout(() => {
    const c = cardOf("SAS");
    if (c) shake(c, "egg-shudder", 900);
  }, 1350);
  setTimeout(() => wrap.remove(), 3600);
}

/** BKN — Stand clear of the closing doors. Any Nets trade: a passing train —
 * low rumble through the card, twin headlights sweeping across it. */
export function subwayEgg() {
  queueEgg("subway", 2200, () => subwayEggRun());
}
function subwayEggRun() {
  leagueToast("Stand clear", "This is a Manhattan-bound B train. The next stop is: a rebuild.");
  if (reducedMotion()) return;
  const card = cardOf("BKN");
  if (!card || document.querySelector(".egg-subway")) return;
  const r = card.getBoundingClientRect();
  const wrap = document.createElement("div");
  wrap.className = "egg-subway";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${r.width}px`;
  wrap.style.height = `${Math.min(r.height, 420)}px`;
  wrap.innerHTML = '<i class="sw-light" style="top:26%"></i><i class="sw-light" style="top:56%;animation-delay:0.5s"></i>';
  document.body.appendChild(wrap);
  shake(card, "egg-rumble", 1900);
  setTimeout(() => wrap.remove(), 2400);
}

/** CLE — The Chalk Toss. A star arrives in Cleveland: the lights dip and the
 * building goes still; a soft clap at the card's bottom edge, then the chalk
 * goes UP — three big blooming puffs and a fan of fine matte grains — each on
 * its own clock, decelerating into a hang at the apex while flashbulbs pop
 * around the dark, then drifting off on the arena draft and settling back
 * onto the ledger's bottom edge. */
export function chalkTossEgg(playerName: string) {
  queueEgg("chalk", 4600, () => chalkTossEggRun(playerName));
}
function chalkTossEggRun(playerName: string) {
  const stamp = "Ritual observed";
  const text = `${playerName}. The chalk goes up. The King is home.`;
  // leagueToast renders in the site toast layer (outside .egg-chalktoss), so
  // reduced-motion users still get the headline, statically.
  if (reducedMotion()) {
    leagueToast(stamp, text);
    return;
  }
  const card = cardOf("CLE");
  if (!card || document.querySelector(".egg-chalktoss")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // burst origin: the exact bottom-center of the measured card, clamped
  // on-screen whether the card runs past the fold OR is scrolled above it
  const x = r.left + r.width / 2;
  const y = Math.max(Math.min(r.bottom, vh - 20), 20);
  const ch = Math.min(r.height, 460); // card scale drives rise height
  const dir = Math.random() < 0.5 ? -1 : 1; // one shared draft direction
  const BURST = 1200; // ms of dark stillness before the toss

  const wrap = document.createElement("div");
  wrap.className = "egg-chalktoss";
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;

  // clap delay derives from BURST so tuning one can't desync the other
  let html = `<i class="ct-dim"></i><i class="ct-clap" style="animation-delay:${BURST - 150}ms"></i>`;

  // three large soft puffs — the body of the cloud, each with its own signed
  // hang micro-drift so the near-stillness shimmers instead of sliding
  const puffs = [
    { ax: -26, ay: -ch * 0.34, s: 92, b: 15, o: 0.62, d: 0 },
    { ax: 4, ay: -ch * 0.45, s: 118, b: 18, o: 0.55, d: 70 },
    { ax: 30, ay: -ch * 0.29, s: 82, b: 13, o: 0.66, d: 130 },
  ];
  for (const p of puffs) {
    const sx = p.ax + dir * (66 + Math.random() * 54);
    const sy = p.ay + 34 + Math.random() * 26;
    const jx = (Math.random() * 8 - 4).toFixed(1);
    const jy = (Math.random() * 10 - 5).toFixed(1);
    html +=
      `<i class="ct-puff" style="width:${p.s}px;height:${p.s}px;--pb:${p.b}px;--po:${p.o};` +
      `--jx:${jx}px;--jy:${jy}px;` +
      `--ax:${p.ax}px;--ay:${p.ay.toFixed(0)}px;--sx:${sx.toFixed(0)}px;--sy:${sy.toFixed(0)}px;` +
      `animation-delay:${BURST + p.d}ms"></i>`;
  }

  // fine grains — a fan of individual trajectories, tallest in the middle.
  // Per-grain duration jitter (±6%) smears apex arrival ~250ms so the fan
  // never peaks in lockstep; per-grain signed (--jx,--jy), some near zero,
  // keep the hang reading as suspended dust rather than a drifting lattice.
  const N = 15;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * 2 - 1; // -1..1 across the fan
    const ax = t * (26 + Math.random() * 58);
    const ay = -(ch * (0.3 + Math.random() * 0.2) + (1 - Math.abs(t)) * ch * 0.16);
    const sx = ax + dir * (58 + Math.random() * 84);
    const sy = ay + 30 + Math.random() * 56;
    const sz = 1.5 + Math.random() * 1.5; // fine: 1.5–3px at card scale
    const o = 0.55 + Math.random() * 0.4;
    const jx = (Math.random() * 10 - 5).toFixed(1);
    const jy = (Math.random() * 8 - 4).toFixed(1);
    const dur = 4600 * (0.94 + Math.random() * 0.12);
    const d = BURST + Math.random() * 120;
    html +=
      `<i class="ct-bit" style="width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;--po:${o.toFixed(2)};` +
      `--jx:${jx}px;--jy:${jy}px;--ax:${ax.toFixed(0)}px;--ay:${ay.toFixed(0)}px;` +
      `--sx:${sx.toFixed(0)}px;--sy:${sy.toFixed(0)}px;` +
      `animation-duration:${dur.toFixed(0)}ms;animation-delay:${d.toFixed(0)}ms"></i>`;
  }

  // flashbulbs in the dark around the card — all six pops land inside the
  // 2490–3320ms hang (last starts ~3200ms, peaks ~3260ms)
  const bulbs = [
    { x: -r.width * 0.46, y: -ch * 0.82 },
    { x: r.width * 0.42, y: -ch * 0.6 },
    { x: -r.width * 0.28, y: -ch * 1.04 },
    { x: r.width * 0.5, y: -ch * 0.92 },
    { x: -r.width * 0.52, y: -ch * 0.38 },
    { x: r.width * 0.18, y: -ch * 1.14 },
  ];
  bulbs.forEach((p, i) => {
    const fx = Math.min(Math.max(p.x + (Math.random() * 24 - 12), 16 - x), vw - 16 - x);
    const fy = Math.max(p.y + (Math.random() * 20 - 10), 16 - y);
    const d = 2460 + i * 140 + Math.random() * 40;
    html += `<b class="ct-flash" style="left:${fx.toFixed(0)}px;top:${fy.toFixed(0)}px;animation-delay:${d.toFixed(0)}ms"></b>`;
  });

  // chalk residue settling back onto the card's bottom edge — its 4s delay
  // lands after the cloud has visibly drifted off the ledger
  html += `<i class="ct-residue" style="left:${(-r.width * 0.24).toFixed(0)}px;width:${(r.width * 0.48).toFixed(0)}px"></i>`;

  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the PA speaks at the top of the hang, between the first two flashes
  setTimeout(() => leagueToast(stamp, text), 2650);
  setTimeout(() => wrap.remove(), 6400);
}

// Design-preview convenience: lets the branch demo each board effect from the
// console without staging the exact trigger move. Dev builds only.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const demo = <A extends unknown[]>(key: string, fn: (...a: A) => void) =>
    (...a: A) => {
      try {
        sessionStorage.removeItem(`apron_egg_seen:${key}`);
      } catch {
        /* ignore */
      }
      fn(...a);
    };
  (window as unknown as Record<string, unknown>).__apronEggs = {
    strikeEgg: demo("strike", strikeEgg),
    introEgg: demo("intro", introEgg),
    confettiEgg: demo("confetti", confettiEgg),
    rockCrackEgg: demo("crack", rockCrackEgg),
    subwayEgg: demo("subway", subwayEgg),
    chalkTossEgg: demo("chalk", chalkTossEgg),
    lightTheBeam: demo("beam", lightTheBeam),
  };
}

/** SAC — THE beam, v3. The Kings card is Golden 1 Center: a glowing roof
 * aperture opens on the card's top edge, the white-hot column erupts through
 * it into the sky (anchored to the card, so it scrolls WITH the building),
 * the arena's skin pulses violet while it burns, and a skyline glow answers
 * at the top of the screen. Only on improvement — that is the entire point
 * of the beam. */
export function lightTheBeam() {
  queueEgg("beam", 3800, () => lightTheBeamRun());
}
function lightTheBeamRun() {
  leagueToast("Beam lit", "Victory-grade improvement detected in Sacramento.");
  if (reducedMotion()) return;
  const card = cardOf("SAC");
  if (!card || card.querySelector(".egg-beam3")) return;
  const r = card.getBoundingClientRect();
  // The card IS Golden 1 Center. The column is anchored INSIDE the card
  // wrapper, so scrolling mid-animation carries the beam with the building —
  // and it's tall enough to run off the top of the screen from any scroll
  // position it could occupy while it burns.
  if (!card.style.position) card.style.position = "relative";
  const beamH = Math.round(Math.max(r.top, window.innerHeight) + 260);
  const beam = document.createElement("div");
  beam.className = "egg-beam3";
  beam.style.height = `${beamH}px`;
  beam.style.setProperty("--bh", `${beamH}px`);
  beam.innerHTML =
    '<i class="b3-glow"></i>' +
    '<i class="b3-col"></i>' +
    '<i class="b3-core"></i>' +
    [0, 1, 2, 3, 4].map((m) => `<i class="b3-mote" style="--m:${m}"></i>`).join("") +
    '<i class="b3-aperture"></i>' +
    '<i class="b3-rim"></i>';
  card.appendChild(beam);
  // the sky answers at the top of the SCREEN, centered over the arena
  const sky = document.createElement("div");
  sky.className = "b3-skyline";
  sky.style.setProperty("--bx", `${r.left + r.width / 2}px`);
  document.body.appendChild(sky);
  // the arena's skin pulses while the beam burns
  card.classList.add("egg-arena");
  setTimeout(() => {
    beam.remove();
    sky.remove();
    card.classList.remove("egg-arena");
  }, 4600);
}

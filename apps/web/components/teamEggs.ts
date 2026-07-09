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

/** CHI — The Intro. A star arrives: the lights go DOWN, one spotlight roves
 * the board Sirius-style and settles on the Bulls card. */
export function introEgg(playerName: string) {
  leagueToast("And now…", `${playerName}. From parts elsewhere. Your newest Bull.`);
  if (reducedMotion()) return;
  const card = cardOf("CHI");
  if (!card || document.querySelector(".egg-intro")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spot = 260; // spotlight diameter
  const pt = (px: number, py: number) => `${(px - spot / 2).toFixed(0)}px, ${(py - spot / 2).toFixed(0)}px`;
  const wrap = document.createElement("div");
  wrap.className = "egg-intro";
  wrap.style.setProperty("--p0", pt(vw * 0.16, vh * 0.22));
  wrap.style.setProperty("--p1", pt(vw * 0.74, vh * 0.3));
  wrap.style.setProperty("--p2", pt(vw * 0.32, vh * 0.62));
  wrap.style.setProperty("--pf", pt(r.left + r.width / 2, r.top + Math.min(r.height / 2, 190)));
  wrap.innerHTML = '<i class="in-spot"></i>';
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3300);
}

/** LAL — Seventeen-and-Counting. A max player arrives via trade: purple and
 * gold confetti pours over the Lakers card only, and a small pennant rises
 * to the rafters (the card's top edge). */
export function confettiEgg() {
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
  const colors = ["#552583", "#fdb927", "#f4f1e9"];
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

// Design-preview convenience: lets the branch demo each board effect from the
// console without staging the exact trigger move. Dev builds only.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__apronEggs = {
    strikeEgg,
    introEgg,
    confettiEgg,
    rockCrackEgg,
    subwayEgg,
    lightTheBeam,
  };
}

/** SAC — THE beam. A white-hot core inside a wide violet bloom fires from the
 * Kings' board card to the top of the screen: ignition flash at the base, a
 * pool of light where it meets the sky, motes rising inside the column, the
 * room glowing faintly violet, then a power-down collapse. Only on
 * improvement, because that is the entire point of the beam. */
export function lightTheBeam() {
  leagueToast("Beam lit", "Victory-grade improvement detected in Sacramento.");
  if (reducedMotion()) return;
  const card = document.querySelector<HTMLElement>('[data-egg-team="SAC"]');
  if (!card || document.querySelector(".egg-beam2")) return;
  const r = card.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const h = Math.max(r.top + 14, 180);
  const wrap = document.createElement("div");
  wrap.className = "egg-beam2";
  wrap.style.left = `${x}px`;
  wrap.style.height = `${h}px`;
  wrap.style.setProperty("--bx", `${x}px`);
  wrap.style.setProperty("--by", `${h}px`);
  wrap.innerHTML =
    '<i class="b2-ambience"></i>' +
    '<i class="b2-glow"></i>' +
    '<i class="b2-beam"></i>' +
    '<i class="b2-core"></i>' +
    '<i class="b2-sky"></i>' +
    '<i class="b2-flash"></i>' +
    [0, 1, 2, 3, 4].map((m) => `<i class="b2-mote" style="--m:${m}"></i>`).join("");
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4300);
}

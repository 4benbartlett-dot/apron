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

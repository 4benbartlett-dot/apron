"use client";

import type { Contract } from "@apron/cba-engine";
import { allocateRotation, secondaryPositionsOf, injuryOf, type RotationSlot } from "@/lib/league";
import { ImpactPill } from "@/components/PlayerTags";

const SLOTS: { pos: string; label: string }[] = [
  { pos: "PG", label: "Point" },
  { pos: "SG", label: "Shooting" },
  { pos: "SF", label: "Small F" },
  { pos: "PF", label: "Power F" },
  { pos: "C", label: "Center" },
];

// Per-game minutes at a spot. A player's slot total is SEASON minutes = mpg ×
// the games he's projected to play, so an injured player (games = 82 − gamesOut)
// must be divided by HIS games, not a flat 82 — otherwise a 31-mpg star out 28
// games reads as a 20-minute role player.
const gamesFor = (id: string) => { const inj = injuryOf(id); return inj && inj.gamesOut >= 5 ? Math.max(1, 82 - inj.gamesOut) : 82; };
const mpgOf = (minutes: number, id: string) => Math.round(minutes / gamesFor(id));

/**
 * Projected rotation, laid out by position. Each of the five on-court spots has
 * a fixed minutes budget; the position-aware model hands them to the best
 * players first (spilling a versatile player to a secondary spot), so this is
 * the minutes each player is projected to actually play — not just who's on the
 * roster. Players squeezed out of the 240-minute-a-night rotation drop to
 * "Out of rotation."
 */
export function DepthChart({ roster }: { roster: Contract[] }) {
  const rot = allocateRotation(roster);
  const byId = new Map(roster.map((c) => [c.playerId, c]));

  // Each player's TOTAL projected minutes, and his spots ranked by minutes there
  // — the basis for a realistic starting five.
  const totalMin = new Map<string, number>();
  const posMinOf = new Map<string, { pos: string; min: number }[]>();
  for (const { pos } of SLOTS) for (const s of rot.byPos[pos] ?? []) {
    totalMin.set(s.playerId, (totalMin.get(s.playerId) ?? 0) + s.minutes);
    const arr = posMinOf.get(s.playerId) ?? [];
    arr.push({ pos, min: s.minutes });
    posMinOf.set(s.playerId, arr);
  }
  // Build the starting five as one player per spot: take players in order of
  // overall role and give each his biggest still-open position. A split starter
  // (plays 55% at the 3, 45% at the 4) still claims a starting job at his main
  // spot, and one center can't occupy two starter slots — so a real wing starter
  // isn't bumped by a backup big who simply logs more raw minutes.
  const starterAt: Record<string, string> = {};
  const homeOf = new Map<string, string>();
  for (const [id] of [...totalMin.entries()].sort((a, b) => b[1] - a[1])) {
    if (Object.keys(starterAt).length >= SLOTS.length) break;
    const open = (posMinOf.get(id) ?? []).slice().sort((a, b) => b.min - a.min).find((x) => !starterAt[x.pos]);
    if (open) { starterAt[open.pos] = id; homeOf.set(id, open.pos); }
  }
  const isStarter = (id: string) => homeOf.has(id);
  const startsAt = (id: string, pos: string) => homeOf.get(id) === pos;

  // Display-ready column per spot: this spot's starter leads, then other starters
  // passing through, then bench by minutes here. Sub-1-mpg spillback slivers are
  // dropped (they'd render as a misleading "0m" rotation line) — a starter always
  // shows at his own spot.
  const columns: Record<string, RotationSlot[]> = {};
  for (const { pos } of SLOTS) {
    const rank = (id: string) => (startsAt(id, pos) ? 2 : isStarter(id) ? 1 : 0);
    columns[pos] = [...(rot.byPos[pos] ?? [])]
      .filter((s) => startsAt(s.playerId, pos) || mpgOf(s.minutes, s.playerId) >= 1)
      .sort((a, b) => {
        const r = rank(b.playerId) - rank(a.playerId);
        if (r) return r;
        if (isStarter(a.playerId)) return (totalMin.get(b.playerId) ?? 0) - (totalMin.get(a.playerId) ?? 0);
        return b.minutes - a.minutes;
      });
  }

  // Anyone on the roster the model never gives displayed minutes (no projected
  // role, squeezed out, or only sub-1-mpg slivers) is surfaced so nobody silently
  // disappears.
  const shown = new Set<string>();
  for (const { pos } of SLOTS) for (const s of columns[pos]!) shown.add(s.playerId);
  const out = [
    ...rot.benched,
    ...roster
      .filter((c) => {
        const y = c.years.find((yr) => yr.leagueYear === "2026-27");
        return (y?.salary ?? 0) > 0 && !c.deadMoney && !shown.has(c.playerId) && !rot.benched.some((b) => b.playerId === c.playerId);
      })
      .map((c) => ({ playerId: c.playerId, playerName: c.playerName, av: 0 })),
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {SLOTS.map(({ pos, label }) => {
          const slots = columns[pos] ?? [];
          return (
            <div key={pos} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2">
              <div className="label mb-1.5 flex items-baseline justify-between !text-[9.5px]">
                <span>{pos}</span>
                <span className="text-[var(--muted)]">{label}</span>
              </div>
              <div className="space-y-1">
                {slots.map((s) => {
                  const c = byId.get(s.playerId);
                  const sec = secondaryPositionsOf(s.playerId);
                  return (
                    <div
                      key={s.playerId + pos}
                      className="flex items-center gap-1 rounded bg-[var(--panel)] px-1.5 py-1 text-[11.5px]"
                      style={{ opacity: isStarter(s.playerId) ? 1 : s.secondary ? 0.72 : 0.9 }}
                      title={`${s.playerName} · ${s.age} yrs · ~${mpgOf(s.minutes, s.playerId)} mpg at ${pos}${sec.length ? ` (also ${sec.join("/")})` : ""}`}
                    >
                      <ImpactPill c={c} />
                      <span className="min-w-0 flex-1 truncate">{s.playerName}</span>
                      {(() => { const inj = injuryOf(s.playerId); return inj && inj.gamesOut >= 5 ? <span className="shrink-0 text-[8px] font-bold uppercase text-[var(--tier-second_apron)]" title={`${inj.type} — ~${inj.gamesOut} games out to start`}>INJ</span> : null; })()}
                      {startsAt(s.playerId, pos) && <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-[var(--tier-below_cap)]">ST</span>}
                      <span className="tabular shrink-0 text-[9px] text-[var(--muted)]">{s.age}y</span>
                      <span className="tabular shrink-0 font-semibold">
                        {mpgOf(s.minutes, s.playerId)}<span className="text-[8px] font-normal text-[var(--muted)]">m</span>
                      </span>
                    </div>
                  );
                })}
                {!slots.length && <div className="px-1 py-2 text-center text-[10px] text-[var(--muted)]">—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {out.length > 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-[var(--border)] p-2">
          <div className="label mb-1 !text-[9.5px]">Out of rotation <span className="text-[var(--muted)]">· no projected minutes in the 240-a-night budget</span></div>
          <div className="flex flex-wrap gap-1">
            {out.map((b) => {
              const inj = injuryOf(b.playerId);
              const hurt = inj && inj.gamesOut >= 5;
              return (
                <span key={b.playerId} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${hurt ? "text-[var(--tier-second_apron)]" : "text-[var(--muted)]"}`} style={{ background: hurt ? "color-mix(in srgb, var(--tier-second_apron) 10%, transparent)" : "var(--panel-2)" }} title={hurt ? `${inj!.type} — ${inj!.desc}` : b.playerName}>
                  <ImpactPill c={byId.get(b.playerId)} />
                  <span className="max-w-[9rem] truncate">{b.playerName}</span>
                  {hurt && <span className="text-[8px] font-bold uppercase">{inj!.type}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        Projected minutes from the position-aware rotation model: five on-court spots share a fixed 240-minute-a-night budget, best players first, with versatile players (their secondary spot shown on hover) sliding to a second position. ST = projected starter. Not a coach&rsquo;s actual rotation.
      </p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  spendingPower,
  validateSigning,
  type MechanismId,
} from "@apron/cba-engine";
import { C, TEAM_IDS, teamMeta, feedStateOf, consumedFor } from "@/lib/league";
import { useLeague, dispatchMove } from "@/lib/store";
import { fmtM, fmtFull } from "@/lib/format";
import { TierBadge } from "@/components/TierBadge";
import { Thermometer } from "@/components/Thermometer";
import { TeamLogo } from "@/components/TeamLogo";

function mechColor(id: MechanismId | null): string {
  if (id === "bird" || id === "cap_room") return "var(--tier-below_cap)";
  if (id === "minimum") return "var(--tier-over_cap)";
  if (id === null) return "var(--muted)";
  return "var(--tier-taxpayer)";
}
function chipStyle(color: string): React.CSSProperties {
  return {
    color,
    borderColor: color,
    backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
  };
}

export default function FreeAgencyPage() {
  const lg = useLeague();
  const fas = lg.freeAgents();

  // Default to the team with the most cap room (after holds).
  const defaultTeam = useMemo(() => {
    return [...TEAM_IDS].sort(
      (a, b) =>
        lg.teamSalary(a) + lg.teamHolds(a) - (lg.teamSalary(b) + lg.teamHolds(b)),
    )[0]!;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [team, setTeam] = useState(defaultTeam);

  const power = useMemo(() => {
    const committed = lg.teamSalary(team);
    const holds = lg.teamHolds(team);
    // Room math on committed + holds; exception tiers on APRON salary; feed
    // state (room team, spent exceptions) plus session moves both consume.
    return {
      committed,
      holds,
      ...spendingPower(committed + holds, C, {
        apronSalary: committed,
        roomTeam: feedStateOf(team).roomTeam,
        consumed: consumedFor(lg.moves, team),
      }),
    };
  }, [team, lg]);

  const meta = teamMeta(team);

  const sign = (
    playerId: string,
    playerName: string,
    salary: number,
    mechanism?: MechanismId,
    restricted = true,
  ) =>
    // Mechanism rides along so the session remembers hard caps and
    // exception consumption no matter which page the signing came from.
    dispatchMove({
      kind: "sign",
      label: `${restricted ? "Sign" : "Extend"}: ${playerName} → ${team}`,
      playerId,
      playerName,
      teamId: team,
      salary,
      mechanism,
      restricted,
    });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Free Agency</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick a team to see its spending power and sign from the {fas.length}{" "}
          available free agents (asking = last salary). Signings join the same offseason session as the main board.
        </p>
      </div>

      <div className="panel mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <TeamLogo id={team} size={32} />
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-semibold focus:outline-none"
          >
            {TEAM_IDS.map((id) => (
              <option key={id} value={id}>{teamMeta(id).name}</option>
            ))}
          </select>
          <TierBadge tier={power.tier} />
          <span className="tabular text-sm text-[var(--muted)]">
            {fmtFull(power.committed)} committed + {fmtM(power.holds)} FA holds
            {power.capRoom > 0 && (
              <span className="text-[var(--tier-below_cap)]"> · {fmtM(power.capRoom)} cap space</span>
            )}
          </span>
        </div>

        <div className="mt-3">
          <Thermometer salary={power.teamSalary} c={C} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {power.mechanisms.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={chipStyle(mechColor(m.id))} title={m.citation}>
              {m.label}
              <span className="tabular opacity-80">{fmtM(m.maxSalary)}</span>
              {m.hardCap && <span className="opacity-70">· caps {m.hardCap === "first_apron" ? "1A" : "2A"}</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_3.5rem_5.5rem_13rem] gap-2 border-b border-[var(--border)] px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">
          <div>#</div>
          <div>Free agent</div>
          <div>Prior</div>
          <div className="text-right">Asking</div>
          <div className="text-right">{meta.id} sign</div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {fas.map((fa, i) => {
            // Bird rights require the hold to be KEPT — a renounced FA
            // (session or real-July forced) is an outside signing here too.
            const isOwn = fa.priorTeam === team && !fa.renounced;
            const v = validateSigning(power.teamSalary, fa.lastSalary, C, { isOwnFreeAgent: isOwn, yearsOfService: fa.yearsOfService, priorSalary: fa.lastSalary, birdStatus: isOwn ? "bird" : undefined, apronSalary: power.committed, roomTeam: feedStateOf(team).roomTeam, consumed: consumedFor(lg.moves, team) });
            const mech = v.mechanism;
            const color = mechColor(mech ? mech.id : null);
            const salary = v.legal ? fa.lastSalary : v.maxOffer;
            const label = v.legal ? mech!.label : `max ${fmtM(v.maxOffer)}`;
            return (
              <div key={fa.playerId} className="grid grid-cols-[2rem_1fr_3.5rem_5.5rem_13rem] items-center gap-2 border-b border-[var(--border)]/40 px-4 py-2 text-sm hover:bg-[var(--panel-2)]">
                <div className="tabular text-[var(--muted)]">{i + 1}</div>
                <div className="flex items-center gap-2 truncate font-medium">
                  <span className="truncate">{fa.playerName}</span>
                  {isOwn && <span className="shrink-0 text-[10px] font-bold text-[var(--tier-below_cap)]">OWN</span>}
                </div>
                <div className="text-[var(--muted)]">{fa.priorTeam}</div>
                <div className="tabular text-right">{fmtM(fa.lastSalary)}</div>
                <div className="flex justify-end">
                  <button
                    onClick={() => sign(fa.playerId, fa.playerName, salary, (v.legal ? v.mechanism : v.maxOfferMechanism)?.id)}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold hover:brightness-125"
                    style={chipStyle(color)}
                    title={`${v.reason} New contract — trade-restricted until Dec 15.`}
                  >
                    {isOwn ? "Re-sign" : "Sign"} · {label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        “Asking” uses each player’s last salary as a market proxy. Click to sign
        (own free agents re-sign via Bird; others by exception or cap space).
      </p>
    </div>
  );
}

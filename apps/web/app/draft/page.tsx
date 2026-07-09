"use client";

import { useState } from "react";
import { DRAFT_PICKS, type DraftPick } from "@apron/data";
import { TEAM_IDS, teamMeta, byNickname } from "@/lib/league";
import { useMoves } from "@/lib/store";

function isFirst(p: DraftPick) {
  return /first round/i.test(p.headline);
}

function PickRow({ p }: { p: DraftPick }) {
  const first = isFirst(p);
  return (
    <div className="border-b border-[var(--border)]/30 py-2">
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            color: first ? "var(--tier-first_apron)" : "var(--tier-over_cap)",
            background: `color-mix(in srgb, ${first ? "var(--tier-first_apron)" : "var(--tier-over_cap)"} 14%, transparent)`,
          }}
        >
          {p.year} {first ? "1st" : "2nd"}
        </span>
        <span className="text-sm">{p.headline.replace(/^\d{4}\s+(first|second) round draft pick\s*/i, "")}</span>
      </div>
      {p.detail && <div className="mt-1 pl-1 text-xs leading-snug text-[var(--muted)]">{p.detail}</div>}
    </div>
  );
}

export default function DraftPicksPage() {
  const moves = useMoves();
  const picksMoved = moves.reduce((n, m) => n + (m.kind === "trade" ? m.picks?.length ?? 0 : 0), 0);
  const teamsWithPicks = TEAM_IDS.filter((id) => DRAFT_PICKS[id]).sort(byNickname);
  const [team, setTeam] = useState(teamsWithPicks.includes("BKN") ? "BKN" : teamsWithPicks[0]!);
  const picks = DRAFT_PICKS[team] ?? { incoming: [], outgoing: [] };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Draft-Pick Ledger</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Future picks by team — owed, owned, swaps, and protections.
            This page reflects the current obligation ledger
            {picksMoved > 0
              ? ` — the ${picksMoved} pick${picksMoved > 1 ? "s" : ""} you've traded this session live in the boards' DRAFT PICKS OWNED chips.`
              : "; picks you trade in the sim move on the board's chips."}
          </p>
        </div>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="ml-auto rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-semibold"
        >
          {teamsWithPicks.map((id) => (
            <option key={id} value={id}>{teamMeta(id).name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <span className="text-[var(--tier-below_cap)]">▲</span> Incoming
            <span className="text-[var(--muted)]">({picks.incoming.length})</span>
          </div>
          {picks.incoming.length === 0 && <div className="py-2 text-sm text-[var(--muted)]">No extra incoming picks.</div>}
          {picks.incoming.map((p, i) => (
            <PickRow key={i} p={p} />
          ))}
        </div>

        <div className="panel p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <span className="text-[var(--tier-second_apron)]">▼</span> Outgoing
            <span className="text-[var(--muted)]">({picks.outgoing.length})</span>
          </div>
          {picks.outgoing.length === 0 && <div className="py-2 text-sm text-[var(--muted)]">No picks owed.</div>}
          {picks.outgoing.map((p, i) => (
            <PickRow key={i} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

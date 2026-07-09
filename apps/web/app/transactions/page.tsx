"use client";

import { useMemo, useState } from "react";
import { TRANSACTIONS } from "@apron/data";
import { useMoves, PICK_YEARS } from "@/lib/store";
import { BASE_CONTRACTS, TEAM_IDS, applyMove, teamMeta, type Move } from "@/lib/league";
import { fmtM } from "@/lib/format";

const TYPE_COLOR: Record<string, string> = {
  Trade: "var(--tier-second_apron)",
  Signing: "var(--tier-below_cap)",
  "Re-sign": "var(--tier-below_cap)",
  Extension: "var(--tier-taxpayer)",
  Release: "var(--muted)",
  "Qualifying Offer": "var(--tier-over_cap)",
  Option: "var(--tier-over_cap)",
  Renounce: "var(--muted)",
  "S&T": "var(--tier-taxpayer)",
  Other: "var(--muted)",
};

const KIND_TYPE: Record<string, string> = {
  trade: "Trade",
  sign: "Signing",
  sign_trade: "S&T",
  extend: "Extension",
  renounce: "Renounce",
};

const MECH_LABEL: Record<string, string> = {
  bird: "Bird rights",
  cap_room: "cap space",
  ntmle: "the Non-Tax MLE",
  tpmle: "the Taxpayer MLE",
  room_mle: "the Room MLE",
  bae: "the BAE",
  minimum: "the minimum",
};

interface MoveRow {
  kind: string;
  headline: string;
  detail: string;
}

/** Team-attributed descriptions of the user's moves. Trades only store
 * destinations, so we replay the move list against the base league to know
 * each player's team AT THE TIME of the move. */
function describeMoves(moves: Move[]): MoveRow[] {
  let cs = BASE_CONTRACTS;
  const pickOwner = new Map<string, string>();
  for (const t of TEAM_IDS)
    for (const y of PICK_YEARS) for (const r of [1, 2]) pickOwner.set(`${t}|${y}|${r}`, t);

  const nameOf = (pid: string) => cs.find((c) => c.playerId === pid)?.playerName ?? pid;
  const teamOf = (pid: string) => cs.find((c) => c.playerId === pid)?.teamId;

  const rows: MoveRow[] = [];
  for (const m of moves) {
    if (m.kind === "trade") {
      const legs = m.players.map((p) => ({
        name: nameOf(p.playerId).split(" ").slice(-1)[0]!,
        from: teamOf(p.playerId) ?? "?",
        to: p.to,
      }));
      const byRoute = new Map<string, string[]>();
      for (const l of legs) {
        const k = `${l.from} → ${l.to}`;
        byRoute.set(k, [...(byRoute.get(k) ?? []), l.name]);
      }
      const pickBits = (m.picks ?? []).map((pk) => {
        const [origin, y, r] = pk.id.split("|");
        const from = pickOwner.get(pk.id) ?? origin!;
        return `${origin} ${y} ${r === "1" ? "1st" : "2nd"} (${from} → ${pk.to})`;
      });
      const teams = [...new Set(legs.flatMap((l) => [l.from, l.to]))];
      rows.push({
        kind: m.kind,
        headline: `${teams.join(" ⇄ ")} trade`,
        detail: [
          ...[...byRoute.entries()].map(([route, names]) => `${route}: ${names.join(", ")}`),
          ...pickBits,
        ].join(" · "),
      });
    } else if (m.kind === "sign") {
      rows.push({
        kind: m.kind,
        headline: `${teamMeta(m.teamId).name} sign ${m.playerName}`,
        detail: `${fmtM(m.salary)}${(m.years ?? 1) > 1 ? ` × ${m.years}y` : ""}${m.mechanism ? ` via ${MECH_LABEL[m.mechanism] ?? m.mechanism}` : ""}`,
      });
    } else if (m.kind === "sign_trade") {
      rows.push({
        kind: m.kind,
        headline: `${teamMeta(m.fromTeam ?? "—").name} sign-and-trade ${m.playerName} to ${m.toTeam}`,
        detail: `${fmtM(m.salary)} × ${m.years}y${m.returnPlayers?.length ? ` · return: ${m.returnPlayers.map((id) => nameOf(id).split(" ").slice(-1)[0]).join(", ")}` : ""}`,
      });
    } else if (m.kind === "extend") {
      const team = teamOf(m.playerId);
      rows.push({
        kind: m.kind,
        headline: `${team ? teamMeta(team).name : "—"} extend ${m.playerName}`,
        detail: `${fmtM(m.salary)} × ${m.years}y added`,
      });
    } else if (m.kind === "renounce") {
      rows.push({
        kind: m.kind,
        headline: `${teamMeta(m.team).name} renounce ${m.playerName}`,
        detail: "Cap hold cleared — Bird rights forfeited",
      });
    } else {
      rows.push({ kind: "other", headline: (m as { label?: string }).label ?? "Move", detail: "" });
    }
    cs = applyMove(cs, m);
    if (m.kind === "trade" && m.picks) {
      for (const pk of m.picks) if (pickOwner.has(pk.id)) pickOwner.set(pk.id, pk.to);
    }
  }
  return rows;
}

export default function TransactionsPage() {
  const moves = useMoves();
  const [includeMine, setIncludeMine] = useState(true);
  const txns = TRANSACTIONS;
  const counts = txns.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] ?? 0) + 1;
    return acc;
  }, {});
  const described = useMemo(() => describeMoves(moves), [moves]);
  const mine = includeMine ? [...described].reverse() : [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Recent transactions</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {txns.length} reported moves — trades, signings, options, and
          qualifying offers as the 2026-27 league year opens
          {moves.length > 0 && ", with your own filings on top"}.
        </p>
        {moves.length > 0 && (
          <button
            onClick={() => setIncludeMine((v) => !v)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-ink)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            aria-pressed={includeMine}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: includeMine ? "var(--accent)" : "var(--border-strong)" }}
            />
            {includeMine
              ? `Showing your ${moves.length} move${moves.length > 1 ? "s" : ""} — tap for the real world only`
              : "Real world only — tap to include your offseason"}
          </button>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, n]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  color: TYPE_COLOR[type] ?? "var(--muted)",
                  borderColor: TYPE_COLOR[type] ?? "var(--muted)",
                  backgroundColor: `color-mix(in srgb, ${TYPE_COLOR[type] ?? "var(--muted)"} 12%, transparent)`,
                }}
              >
                {type} {n}
              </span>
            ))}
        </div>
      </div>

      {mine.length > 0 && (
        <div className="panel mb-4 divide-y divide-[var(--border)]/50" style={{ borderLeft: "3px solid var(--accent)" }}>
          {mine.map((m, i) => {
            const type = KIND_TYPE[m.kind] ?? "Other";
            const color = TYPE_COLOR[type] ?? "var(--muted)";
            return (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className="mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    color,
                    borderColor: color,
                    backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                  }}
                >
                  {type}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{m.headline}</div>
                  {m.detail && <div className="text-sm text-[var(--text)]/85">{m.detail}</div>}
                </div>
                <span className="stamp shrink-0 text-[9px] text-[var(--accent-ink)]">Yours</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel divide-y divide-[var(--border)]/50">
        {txns.map((t, i) => {
          const color = TYPE_COLOR[t.type] ?? "var(--muted)";
          return (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5">
              <span
                className="mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                }}
              >
                {t.type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-semibold">{t.player}</span>{" "}
                  <span className="text-[var(--muted)]">({t.pos})</span>
                </div>
                <div className="text-sm text-[var(--text)]/85">{t.detail}</div>
              </div>
              <div className="shrink-0 text-xs text-[var(--muted)]">{t.date}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

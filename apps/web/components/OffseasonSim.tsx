"use client";

import { useEffect, useMemo, useState } from "react";
import {
  validateTrade,
  validateSigning,
  validateSignAndTrade,
  veteranExtensionMax,
  violatesStepien,
  maxIncomingSalary,
  spendingPower,
  classifyTier,
  type Contract,
  type Trade,
  type TeamTradeSummary,
  type MechanismId,
} from "@apron/cba-engine";
import { C, TEAM_IDS, teamMeta, currentSalary, experienceOf, assetScoreOf, assetMeterValue, pickValue, isExtensionEligible, type FreeAgent } from "@/lib/league";
import { findTradePackages } from "@/lib/tradeFinder";
import { useLeague, dispatchMove, toggleRenounce } from "@/lib/store";
import { fmtM, fmtFull } from "@/lib/format";
import { Thermometer } from "@/components/Thermometer";
import { TierBadge } from "@/components/TierBadge";
import { TeamLogo } from "@/components/TeamLogo";

interface Sel {
  from: string;
  to: string;
}
type LG = ReturnType<typeof useLeague>;

// Picks come from the session pick-ownership ledger (lg.picksOf) — executed
// trades actually transfer them.

function mechColor(id: MechanismId | null): string {
  if (id === "bird" || id === "cap_room") return "var(--tier-below_cap)";
  if (id === "minimum") return "var(--tier-over_cap)";
  if (id === null) return "var(--muted)";
  return "var(--tier-taxpayer)";
}

function valueColor(v: number): string {
  return v >= 85 ? "var(--tier-below_cap)" : v >= 70 ? "var(--tier-over_cap)" : v >= 55 ? "var(--tier-taxpayer)" : "var(--muted)";
}
/** Trade-value pill (5-99): production vs. contract, not a player rating. */
function ValuePill({ c }: { c?: Contract }) {
  const v = c ? assetScoreOf(c) : undefined;
  if (v == null) return null;
  const col = valueColor(v);
  return (
    <span className="tabular shrink-0 rounded px-1 text-[9px] font-bold" style={{ color: col, background: `color-mix(in srgb, ${col} 16%, transparent)` }} title={`Trade value ${v}/99 — production vs. contract (not a player rating)`}>
      {v}
    </span>
  );
}

const BIRD_LABEL: Record<string, string> = {
  bird: "BIRD",
  early_bird: "EARLY BIRD",
  non_bird: "NON-BIRD",
};

const MECH_SHORT: Record<MechanismId, string> = {
  bird: "Bird",
  cap_room: "Cap space",
  ntmle: "NT-MLE",
  tpmle: "Tax MLE",
  room_mle: "Room MLE",
  bae: "BAE",
  minimum: "Min",
};

export default function OffseasonSim() {
  const lg = useLeague();
  const [board, setBoard] = useState<string[]>(["BOS", "LAL"]);
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [pickSel, setPickSel] = useState<Record<string, Sel>>({});
  const [signFor, setSignFor] = useState<string | null>(null);
  const [extendFor, setExtendFor] = useState<{ playerId: string; playerName: string; team: string } | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);

  // Stage a found trade package onto the board (adds both teams + selects moves).
  const loadTradePackage = (acquirer: string, seller: string, targetId: string, playerIds: string[]) => {
    setBoard((b) => {
      const next = [...b];
      for (const t of [acquirer, seller]) if (!next.includes(t) && next.length < 8) next.push(t);
      return next;
    });
    setSel(() => {
      const s: Record<string, Sel> = { [targetId]: { from: seller, to: acquirer } };
      for (const pid of playerIds) s[pid] = { from: acquirer, to: seller };
      return s;
    });
    setFinderOpen(false);
  };

  // Persist the board across reloads and restore a shared ?board= list.
  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get("board");
      const raw = param
        ? param.split(",")
        : JSON.parse(localStorage.getItem("apron_board_v1") || "null");
      if (Array.isArray(raw)) {
        const valid = raw.filter((t: string) => TEAM_IDS.includes(t)).slice(0, 8);
        if (valid.length) setBoard(valid);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("apron_board_v1", JSON.stringify(board));
    } catch {
      /* ignore */
    }
  }, [board]);

  const addTeam = (id: string) =>
    setBoard((b) => (b.includes(id) || b.length >= 8 ? b : [...b, id]));
  const removeTeam = (id: string) => {
    setBoard((b) => b.filter((t) => t !== id));
    setSel((s) => {
      const n = { ...s };
      for (const [p, mv] of Object.entries(n)) if (mv.from === id || mv.to === id) delete n[p];
      return n;
    });
    if (signFor === id) setSignFor(null);
  };
  const togglePlayer = (pid: string, from: string) =>
    setSel((s) => {
      const n = { ...s };
      if (n[pid]) delete n[pid];
      else n[pid] = { from, to: board.find((t) => t !== from) ?? from };
      return n;
    });
  const setDest = (pid: string, to: string) =>
    setSel((s) => ({ ...s, [pid]: { ...s[pid]!, to } }));
  const togglePick = (pid: string, from: string) =>
    setPickSel((s) => {
      const n = { ...s };
      if (n[pid]) delete n[pid];
      else n[pid] = { from, to: board.find((t) => t !== from) ?? from };
      return n;
    });

  const { trade, verdict, byTeam } = useMemo(() => {
    const players = Object.entries(sel)
      .filter(([, mv]) => board.includes(mv.from) && board.includes(mv.to))
      .map(([pid, mv]) => ({ playerId: pid, from: mv.from, to: mv.to }));
    const tr: Trade = { teams: board, players };
    const v = validateTrade(lg.data, tr, C);
    return { trade: tr, verdict: v, byTeam: new Map(v.teams.map((t) => [t.teamId, t])) };
  }, [board, sel, lg]);

  const hasTrade = trade.players.length > 0 || Object.keys(pickSel).length > 0;

  // Ted Stepien rule, against the FULL pick-ownership ledger: after this trade
  // (and every prior executed one), no team may lack a first-round pick in
  // consecutive future years.
  const stepienViolations = useMemo(() => {
    const outBy: Record<string, string[]> = {};
    const inBy: Record<string, string[]> = {};
    const touched = new Set<string>();
    for (const [id, mv] of Object.entries(pickSel)) {
      (outBy[mv.from] ??= []).push(id);
      (inBy[mv.to] ??= []).push(id);
      touched.add(mv.from);
      touched.add(mv.to);
    }
    return [...touched]
      .filter((t) => violatesStepien(lg.yearsWithoutFirst(t, outBy[t] ?? [], inBy[t] ?? [])))
      .map((t) => `${teamMeta(t).name} would be without a first-round pick in consecutive future drafts (Stepien rule).`);
  }, [pickSel, lg]);

  // Player + pick value flowing in/out per team (for the fair-trade meter).
  const valueByTeam = useMemo(() => {
    const m: Record<string, { in: number; out: number }> = {};
    for (const p of trade.players) {
      const contract = lg.contracts.find((c) => c.playerId === p.playerId);
      const val = contract ? assetMeterValue(contract) : 0;
      (m[p.from] ??= { in: 0, out: 0 }).out += val;
      (m[p.to] ??= { in: 0, out: 0 }).in += val;
    }
    for (const [id, mv] of Object.entries(pickSel)) {
      const [origin, yearStr, round] = id.split("|");
      const val = pickValue(Number(yearStr), round === "1" ? 1 : 2, origin);
      (m[mv.from] ??= { in: 0, out: 0 }).out += val;
      (m[mv.to] ??= { in: 0, out: 0 }).in += val;
    }
    return m;
  }, [trade, pickSel, lg]);

  // A hard cap triggered earlier (MLE/BAE/S&T) binds later trades too.
  const hardCapTradeViolations = useMemo(() => {
    const out: string[] = [];
    for (const t of verdict.teams) {
      const cap = lg.hardCapOf(t.teamId);
      if (t.postTradeSalary > cap + 1) {
        out.push(`${teamMeta(t.teamId).name} is hard-capped at ${fmtM(cap)} from an earlier move — this trade would put them at ${fmtM(t.postTradeSalary)}.`);
      }
    }
    return out;
  }, [verdict, lg]);

  const executeTrade = () => {
    const names = trade.players.map((p) => lg.playerName(p.playerId).split(" ").slice(-1)[0]);
    const pickMoves = Object.entries(pickSel).map(([id, mv]) => ({ id, to: mv.to }));
    dispatchMove({
      kind: "trade",
      label: `Trade: ${names.join(", ")}${pickMoves.length ? ` +${pickMoves.length} pick${pickMoves.length > 1 ? "s" : ""}` : ""}`,
      players: trade.players.map((p) => ({ playerId: p.playerId, to: p.to })),
      picks: pickMoves,
    });
    setSel({});
    setPickSel({});
  };

  const available = TEAM_IDS.filter((t) => !board.includes(t));

  return (
    <div className="pb-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            The offseason, under the real CBA.
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Put teams on the board, then trade, sign, extend, and renounce — every
            move builds on the last from today&rsquo;s live rosters, and every verdict
            cites the rule.
          </p>
        </div>
        <button
          onClick={() => setFinderOpen(true)}
          className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-white"
        >
          Trade finder
        </button>
      </div>

      {/* board controls */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {board.map((id) => (
          <span key={id} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] py-1 pl-2 pr-1.5 text-[13px] font-medium">
            <TeamLogo id={id} size={16} />
            {teamMeta(id).name}
            <button onClick={() => removeTeam(id)} aria-label={`Remove ${teamMeta(id).name}`} className="rounded px-0.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--tier-second_apron)]">✕</button>
          </span>
        ))}
        {board.length < 8 && (
          <select value="" onChange={(e) => e.target.value && addTeam(e.target.value)} className="rounded-md border border-dashed border-[var(--border-strong)] bg-transparent px-2 py-1 text-[13px] text-[var(--muted)] hover:border-[var(--text)]">
            <option value="">+ Add team</option>
            {available.map((id) => (
              <option key={id} value={id}>{teamMeta(id).name}</option>
            ))}
          </select>
        )}
      </div>

      {/* trade verdict */}
      {hasTrade && (
        <TradeVerdict verdict={verdict} extraViolations={[...stepienViolations, ...hardCapTradeViolations]} valueByTeam={valueByTeam} onExecute={executeTrade} lg={lg} />
      )}

      {/* board */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {board.map((id) => (
          <TeamColumn
            key={id}
            teamId={id}
            board={board}
            lg={lg}
            summary={byTeam.get(id)}
            sel={sel}
            onTogglePlayer={togglePlayer}
            onDest={setDest}
            picks={lg.picksOf(id)}
            pickSel={pickSel}
            onTogglePick={togglePick}
            onSign={() => setSignFor(id)}
            onExtend={(playerId, playerName) => setExtendFor({ playerId, playerName, team: id })}
          />
        ))}
        {board.length === 0 && (
          <div className="panel p-6 text-center text-sm text-[var(--muted)]">
            Add teams to your board to start building your offseason.
          </div>
        )}
      </div>

      {signFor && <SignDrawer team={signFor} lg={lg} onClose={() => setSignFor(null)} />}
      {extendFor && <ExtendDrawer {...extendFor} lg={lg} onClose={() => setExtendFor(null)} />}
      {finderOpen && <TradeFinderDrawer board={board} lg={lg} onClose={() => setFinderOpen(false)} onLoad={loadTradePackage} />}
    </div>
  );
}

function TradeVerdict({
  verdict,
  extraViolations = [],
  valueByTeam = {},
  onExecute,
  lg,
}: {
  verdict: ReturnType<typeof validateTrade>;
  extraViolations?: string[];
  valueByTeam?: Record<string, { in: number; out: number }>;
  onExecute: () => void;
  lg: LG;
}) {
  const legal = verdict.legal && extraViolations.length === 0;
  const firstReason = verdict.violations[0]?.reason ?? extraViolations[0];
  const color = legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)";
  const valTeams = Object.entries(valueByTeam).filter(([, v]) => v.in > 0 || v.out > 0);
  const maxNet = Math.max(1, ...valTeams.map(([, v]) => Math.abs(v.in - v.out)));
  const totalVal = Math.max(1, ...valTeams.map(([, v]) => v.in + v.out));
  const fairness = maxNet / totalVal; // 0 = perfectly even
  const fairLabel = fairness < 0.15 ? "Even value" : fairness < 0.4 ? "Slight edge" : "Lopsided";
  return (
    <div className="panel overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <span className="label !text-[11px]" style={{ color }}>
            {legal ? "Legal trade" : "Blocked"}
          </span>
          {!legal && (
            <div className="mt-0.5 text-sm leading-snug text-[var(--text)]">{firstReason}</div>
          )}
        </div>
        {legal && (
          <button
            onClick={onExecute}
            className="shrink-0 rounded-md px-3.5 py-1.5 text-sm font-semibold text-white hover:brightness-95"
            style={{ background: color }}
          >
            Execute trade
          </button>
        )}
      </div>
      {valTeams.length >= 2 && (
        <div className="rule flex flex-wrap items-center gap-x-5 gap-y-1 bg-[var(--panel-2)]/50 px-4 py-2 text-xs">
          <span className="label">{fairLabel}</span>
          {valTeams.map(([t, v]) => {
            const net = v.in - v.out;
            const c = net > 0 ? "var(--tier-below_cap)" : net < 0 ? "var(--tier-second_apron)" : "var(--muted)";
            return (
              <span key={t} className="tabular text-[11.5px]">
                <span className="font-semibold">{t}</span>{" "}
                <span style={{ color: c }}>{net > 0 ? "+" : ""}{net}</span>
                <span className="text-[var(--muted)]"> · in {v.in} / out {v.out}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamColumn({
  teamId,
  board,
  lg,
  summary,
  sel,
  onTogglePlayer,
  onDest,
  picks,
  pickSel,
  onTogglePick,
  onSign,
  onExtend,
}: {
  teamId: string;
  board: string[];
  lg: LG;
  summary?: TeamTradeSummary;
  sel: Record<string, Sel>;
  onTogglePlayer: (id: string, from: string) => void;
  onDest: (id: string, to: string) => void;
  picks: { id: string; label: string; origin: string }[];
  pickSel: Record<string, Sel>;
  onTogglePick: (id: string, from: string) => void;
  onSign: () => void;
  onExtend: (playerId: string, playerName: string) => void;
}) {
  const meta = teamMeta(teamId);
  const committed = lg.teamSalary(teamId);
  const holds = lg.teamHolds(teamId);
  const power = spendingPower(committed + holds, C);
  const roster = lg.roster(teamId);
  const others = board.filter((t) => t !== teamId);
  const pre = summary?.preTradeSalary ?? committed;
  const post = summary?.postTradeSalary ?? pre;
  // Cap-charge view = actual salary + free-agent holds (kept consistent between
  // the thermometer, badge, and exceptions).
  const capCharge = committed + holds;
  const postCharge = summary ? summary.postTradeSalary + holds : capCharge;
  const capRoom = C.salaryCap - capCharge;
  const ownFAs = lg
    .freeAgents()
    .filter((f) => f.priorTeam === teamId)
    .sort((a, b) => b.hold - a.hold);

  // MLE / exception consumption from this offseason's signings.
  const exceptionUsed: Partial<Record<MechanismId, number>> = {};
  for (const mv of lg.moves) {
    if (mv.kind === "sign" && mv.teamId === teamId && mv.mechanism) {
      exceptionUsed[mv.mechanism] = (exceptionUsed[mv.mechanism] ?? 0) + mv.salary;
    }
  }
  const line = (m: { maxSalary: number; hardCap: "first_apron" | "second_apron" | null }) =>
    Math.min(m.maxSalary, m.hardCap === "first_apron" ? Math.max(0, C.firstApron - committed) : m.hardCap === "second_apron" ? Math.max(0, C.secondApron - committed) : Infinity);

  return (
    <div className="panel overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamLogo id={teamId} size={30} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">{meta.name}</div>
            <div className="tabular mt-0.5 text-xs text-[var(--muted)]">
              {fmtFull(post)}
              {post !== pre && ` (${post > pre ? "+" : ""}${fmtM(post - pre)})`}
              {holds > 0 && <span> · +{fmtM(holds)} holds</span>}
            </div>
          </div>
        </div>
        <TierBadge tier={classifyTier(postCharge, C)} />
      </div>

      <div className="px-4 pt-3">
        <Thermometer salary={capCharge} ghost={postCharge !== capCharge ? postCharge : undefined} c={C} />
      </div>

      {/* four-season commitments */}
      <div className="mx-4 mt-2.5 grid grid-cols-4 divide-x divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)]">
        {lg.multiYear(teamId).map((y) => {
          const pct = Math.max(4, Math.min(100, (y.salary / y.cap) * 100));
          const over = y.salary > y.cap;
          return (
            <div key={y.year} className="bg-[var(--panel-2)]/40 px-1.5 py-1.5 text-center" title={`${y.year}: ${fmtFull(y.salary)} committed across ${y.players} players (proj. cap ${fmtM(y.cap)})`}>
              <div className="label !text-[9px]">’{y.year.slice(2)}</div>
              <div className="tabular text-[11px] font-semibold">{fmtM(y.salary)}</div>
              <div className="mx-auto mt-1 h-[3px] w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full" style={{ width: `${pct}%`, background: over ? "var(--tier-first_apron)" : "var(--border-strong)" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* spending tools */}
      <div className="flex flex-wrap gap-1 px-4 pt-2.5">
        {power.mechanisms.map((m) => {
          const used = exceptionUsed[m.id] ?? 0;
          const remaining = Math.max(0, Math.min(m.maxSalary - used, line(m)));
          return (
            <span
              key={m.id}
              className="tabular rounded-[4px] border bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]"
              style={{ borderColor: used > 0 ? "var(--tier-taxpayer)" : "var(--border)" }}
              title={used > 0 ? `${fmtM(used)} of the ${m.label} used` : m.citation}
            >
              {m.label} <span className="font-semibold text-[var(--text)]">{fmtM(remaining)}</span>
              {used > 0 ? " left" : ""}
            </span>
          );
        })}
      </div>

      <div className="px-4 pt-3">
        <button onClick={onSign} className="w-full rounded-md border border-[var(--tier-below_cap)] px-2 py-1.5 text-xs font-semibold text-[var(--tier-below_cap)] hover:bg-[color-mix(in_srgb,var(--tier-below_cap)_10%,transparent)]">
          Sign a free agent
        </button>
      </div>

      {summary && (summary.outgoingSalary > 0 || summary.incomingSalary > 0) && (
        <div className="mx-4 mt-3 grid grid-cols-2 divide-x divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)] text-xs">
          <div className="bg-[var(--panel-2)]/40 px-2.5 py-1.5">
            <div className="label !text-[9px]">Sends out</div>
            <div className="tabular mt-0.5 font-semibold">{fmtM(summary.outgoingSalary)}</div>
          </div>
          <div className="bg-[var(--panel-2)]/40 px-2.5 py-1.5">
            <div className="label !text-[9px]">Takes back · max {fmtM(summary.maxIncomingAllowed)}</div>
            <div className="tabular mt-0.5 font-semibold">{fmtM(summary.incomingSalary)}</div>
          </div>
        </div>
      )}

      {/* roster */}
      <div className="mt-3 max-h-[300px] overflow-y-auto border-t border-[var(--border)]">
        {roster.map((c) => {
          const mv = sel[c.playerId];
          const out = !!mv;
          return (
            <div
              key={c.playerId}
              className="flex items-center justify-between gap-2 border-b border-[var(--border)]/60 px-4 py-[7px] text-[13.5px] leading-none transition-colors"
              style={{ background: out ? "color-mix(in srgb, var(--tier-second_apron) 9%, transparent)" : undefined }}
            >
              <button onClick={() => onTogglePlayer(c.playerId, teamId)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[var(--accent-ink)]" disabled={others.length === 0}>
                <ValuePill c={c} />
                <span className="truncate">{c.playerName}</span>
                {c.restriction && <span title={c.restriction} className="shrink-0 rounded-[3px] px-1 py-px text-[8.5px] font-bold tracking-[0.05em]" style={{ color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 12%, transparent)" }}>NO-TRADE</span>}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {out && others.length > 1 ? (
                  <select value={mv.to} onChange={(e) => onDest(c.playerId, e.target.value)} className="rounded border border-[var(--border)] bg-[var(--panel)] px-1 py-0.5 text-[10px]">
                    {others.map((t) => <option key={t} value={t}>→ {t}</option>)}
                  </select>
                ) : (
                  out && <span className="tabular text-[10px] font-bold text-[var(--tier-second_apron)]">→ {mv.to}</span>
                )}
                {!out && currentSalary(c) > 0 && isExtensionEligible(c.playerName) && (
                  <button onClick={() => onExtend(c.playerId, c.playerName)} title="Extend this contract" className="rounded-[3px] border border-[var(--border)] px-1 py-px text-[8.5px] font-bold tracking-[0.05em] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]">
                    EXT
                  </button>
                )}
                <span className="tabular w-14 text-right text-xs text-[var(--muted)]">{currentSalary(c) > 0 ? fmtM(currentSalary(c)) : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {ownFAs.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">Free agents · holds</span>
            <span className={`tabular text-[10px] font-semibold ${capRoom > 0 ? "text-[var(--tier-below_cap)]" : "text-[var(--muted)]"}`}>
              {capRoom > 0 ? `room ${fmtM(capRoom)}` : `${fmtM(holds)} in holds`}
            </span>
          </div>
          <div className="max-h-[168px] space-y-px overflow-y-auto">
            {ownFAs.map((fa) => (
              <div key={fa.playerId} className="flex items-center justify-between gap-2 py-[3px] text-xs">
                <span className={`min-w-0 flex-1 truncate ${fa.renounced ? "text-[var(--muted)] line-through" : ""}`} title={`${fmtM(fa.lastSalary)} last salary`}>
                  {fa.playerName}
                </span>
                <span className="tabular shrink-0 text-[var(--muted)]">{fa.renounced ? "—" : fmtM(fa.hold)}</span>
                <button
                  onClick={() => toggleRenounce(fa.playerId, fa.playerName, teamId)}
                  className={`w-[68px] shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.05em] ${fa.renounced ? "border-[var(--tier-below_cap)] text-[var(--tier-below_cap)] hover:bg-[color-mix(in_srgb,var(--tier-below_cap)_10%,transparent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"}`}
                >
                  {fa.renounced ? "Restore" : "Renounce"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-2.5 pb-3">
          <div className="label mb-1.5">Draft picks owned</div>
          <div className="flex flex-wrap gap-1">
            {picks.map((p) => {
              const mv = pickSel[p.id];
              const out = !!mv;
              return (
                <button
                  key={p.id}
                  onClick={() => onTogglePick(p.id, teamId)}
                  className="tabular rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium"
                  style={out
                    ? { borderColor: "var(--tier-second_apron)", color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 9%, transparent)" }
                    : { borderColor: "var(--border)", color: p.origin === teamId ? "var(--muted)" : "var(--accent-ink)", background: "var(--panel)" }}
                >
                  {p.label}{out ? ` → ${mv.to}` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// True if this FA is the team's own free agent whose hold is still counted
// (i.e. not renounced) — the case where Bird rights apply.
const isOwnKept = (fa: FreeAgent, team: string) =>
  fa.priorTeam === team && !fa.renounced;

function SignDrawer({ team, lg, onClose }: { team: string; lg: LG; onClose: () => void }) {
  const committed = lg.teamSalary(team);
  const holds = lg.teamHolds(team);
  const fas = lg.freeAgents();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<FreeAgent | null>(null);
  const list = q ? fas.filter((f) => f.playerName.toLowerCase().includes(q.toLowerCase())) : fas;
  // Signing base = committed + kept holds; re-signing your own FA converts HIS
  // hold to salary, so it drops out of the base for that player.
  const signBaseFor = (fa: FreeAgent) =>
    committed + holds - (isOwnKept(fa, team) ? fa.hold : 0);

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-[-8px_0_24px_rgba(33,29,19,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <TeamLogo id={team} size={24} />
          <div className="text-sm font-semibold">Sign a free agent — {teamMeta(team).name}</div>
        </div>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
      </div>

      {selected ? (
        <SignEditor
          fa={selected}
          team={team}
          committed={committed}
          holds={holds}
          lg={lg}
          onBack={() => setSelected(null)}
          onDone={onClose}
        />
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search free agents…" className="m-3 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm focus:outline-none" />
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {list.map((fa) => {
              const isOwn = isOwnKept(fa, team);
              const v = validateSigning(signBaseFor(fa), fa.lastSalary, C, { isOwnFreeAgent: isOwn, yearsOfService: fa.yearsOfService, priorSalary: fa.lastSalary, birdStatus: isOwn ? fa.birdStatus : undefined });
              const color = mechColor(v.mechanism ? v.mechanism.id : null);
              const label = v.legal ? v.mechanism!.label : `max ${fmtM(v.maxOffer)}`;
              return (
                <button key={fa.playerId} onClick={() => setSelected(fa)} className="mb-1 flex w-full items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] px-3 py-2 text-left text-sm hover:brightness-125" title="Set the salary and term">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{fa.playerName}</span>
                    {isOwn && <span className="text-[9px] font-bold text-[var(--tier-below_cap)]">OWN</span>}
                    {fa.faType === "RFA" && <span className="text-[9px] font-bold text-[var(--tier-taxpayer)]">RFA</span>}
                    {fa.renounced && <span className="text-[9px] font-bold text-[var(--muted)]">RENOUNCED</span>}
                    <span className="tabular text-xs text-[var(--muted)]">{fmtM(fa.lastSalary)}</span>
                  </span>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color, borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const YEAR_STR = C.leagueYear;
const YEAR0 = Number(String(C.leagueYear).slice(0, 4));
const seasonLabel = (k: number) =>
  `${YEAR0 + k}-${String((YEAR0 + 1 + k) % 100).padStart(2, "0")}`;
const round100k = (n: number) => Math.round(n / 100_000) * 100_000;

/** Salary + term editor for one free agent, with live CBA validation. */
function SignEditor({
  fa,
  team,
  committed,
  holds,
  lg,
  onBack,
  onDone,
}: {
  fa: FreeAgent;
  team: string;
  committed: number;
  holds: number;
  lg: LG;
  onBack: () => void;
  onDone: () => void;
}) {
  // Bird rights apply only to your own FA whose hold you've kept. Re-signing him
  // converts HIS hold to salary, so it drops out of the signing base.
  const isOwn = isOwnKept(fa, team);
  const base = committed + holds - (isOwn ? fa.hold : 0);
  const opts = {
    isOwnFreeAgent: isOwn,
    yearsOfService: fa.yearsOfService,
    priorSalary: fa.lastSalary,
    birdStatus: isOwn ? fa.birdStatus : undefined,
  };
  const ceilingRaw = validateSigning(base, fa.lastSalary, C, opts).maxOffer;
  const minYos = Math.min(Math.max(Math.floor(fa.yearsOfService), 0), 10);
  const floor = C.minimumSalaries[minYos] ?? C.minimumSalaries[10] ?? 1_000_000;
  // Exact bounds — the minimum/max aren't round numbers, so rounding them would
  // push past the true limit and read as illegal. The slider just steps by 100k.
  // A restricted FA with 1-2 years of service is a Gilbert Arenas case: the
  // offer sheet's first year is capped at the Non-Taxpayer MLE.
  const isArenasRfa = fa.faType === "RFA" && !isOwn && fa.yearsOfService <= 2;
  const ceiling = isArenasRfa
    ? Math.min(Math.max(ceilingRaw, floor), Math.max(C.nonTaxpayerMLE, floor))
    : Math.max(ceilingRaw, floor);
  // Only a FULL Bird re-signing can go 5 years; Early-Bird, Non-Bird, and every
  // outside/exception signing max out at 4.
  const maxYears = isOwn && fa.birdStatus === "bird" ? 5 : 4;

  // Preset amounts for each mechanism the team can actually use (cap space,
  // MLEs, BAE, Bird), plus Min and Max — each clamped to what's legal here.
  const apronOf = (hc: "first_apron" | "second_apron" | null) =>
    hc === "first_apron" ? C.firstApron : hc === "second_apron" ? C.secondApron : Infinity;
  const presets = (() => {
    const out: { label: string; amt: number }[] = [{ label: "Min", amt: floor }];
    for (const m of spendingPower(base, C, opts).mechanisms) {
      if (m.id === "minimum") continue;
      const amt = Math.max(floor, Math.min(m.maxSalary, ceiling, apronOf(m.hardCap) - base));
      out.push({ label: MECH_SHORT[m.id] ?? m.label, amt });
    }
    out.push({ label: "Max", amt: ceiling });
    const seen = new Set<number>();
    return out
      .map((p) => ({ ...p, amt: Math.round(p.amt) }))
      .filter((p) => {
        const k = Math.round(p.amt / 100_000);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.amt - b.amt);
  })();

  const [salary, setSalary] = useState<number>(
    Math.max(floor, Math.min(round100k(fa.lastSalary), ceiling)),
  );
  const [years, setYears] = useState<number>(Math.min(3, maxYears));

  const v = validateSigning(base, salary, C, opts);
  // 8% raises only for a Bird / Early-Bird own-FA re-sign; Non-Bird and every
  // exception/cap-room signing get 5%.
  const raise = isOwn && (fa.birdStatus === "bird" || fa.birdStatus === "early_bird") ? 0.08 : 0.05;
  const rows = Array.from({ length: years }, (_, k) => Math.round(salary * (1 + raise * k)));
  const total = rows.reduce((a, b) => a + b, 0);
  // Post-signing cap charge = base (committed + other kept holds) + new salary.
  const afterCharge = base + salary;
  const afterTier = classifyTier(afterCharge, C);
  // A hard cap triggered earlier this session binds every later move — even a
  // Bird re-sign or a minimum. Enforce it on top of the mechanism check.
  const hardCap = lg.hardCapOf(team);
  const exceedsHardCap = afterCharge > hardCap + 1;
  // Roster limit: 21 in the offseason (hard), 15 by opening night (warn).
  const rosterCount = lg.roster(team).length;
  const rosterFull = rosterCount >= 21;
  const legalSign = v.legal && !exceedsHardCap && !rosterFull;

  // Sign-and-trade: offered for another team's FA the acquirer can't sign
  // outright, as long as the acquirer isn't over the second apron.
  const canOfferSt = !isOwn && !v.legal && classifyTier(committed, C) !== "second_apron";
  const [stMode, setStMode] = useState(false);
  const [returnIds, setReturnIds] = useState<Set<string>>(new Set());
  const acquirerRoster = lg.roster(team);
  const returnSalary = acquirerRoster
    .filter((c) => returnIds.has(c.playerId))
    .reduce((s, c) => s + currentSalary(c), 0);
  // The FA's old team must salary-match the return package it takes back.
  const sendCommitted = lg.teamSalary(fa.priorTeam);
  const sendMatch = maxIncomingSalary(
    salary,
    classifyTier(sendCommitted, C),
    C.salaryCap - sendCommitted,
    C,
  );
  const senderOk = returnSalary <= sendMatch.maxIncoming + 1;
  // Acquirer stays under the first-apron hard cap after sending the return out…
  const acquirerSt = validateSignAndTrade(committed - returnSalary, salary, C);
  // …AND (CBA §8(e)(1)(vii)) must have Room for the new salary or match it with
  // the outgoing return package — free absorption into an over-cap sheet is out.
  const acquirerMatch = maxIncomingSalary(
    returnSalary,
    classifyTier(committed, C),
    C.salaryCap - committed,
    C,
  );
  const acquirerOk = salary <= acquirerMatch.maxIncoming + 1;
  const stFullLegal = acquirerSt.legal && senderOk && acquirerOk;
  const toggleReturn = (id: string) =>
    setReturnIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const sign = () => {
    dispatchMove({
      kind: "sign",
      label: `Sign: ${fa.playerName} → ${team} (${fmtM(salary)}${years > 1 ? ` × ${years}y` : ""})`,
      playerId: fa.playerId,
      playerName: fa.playerName,
      teamId: team,
      salary,
      years,
      mechanism: v.mechanism?.id,
    });
    onDone();
  };
  // Restricted FA: the original team may MATCH the offer sheet — the player
  // stays with them at these exact terms (and is trade-frozen).
  const matchOfferSheet = () => {
    dispatchMove({
      kind: "sign",
      label: `Matched offer sheet: ${fa.playerName} stays ${fa.priorTeam} (${fmtM(salary)}${years > 1 ? ` × ${years}y` : ""})`,
      playerId: fa.playerId,
      playerName: fa.playerName,
      teamId: fa.priorTeam,
      salary,
      years,
      mechanism: "bird", // matching uses the incumbent's rights, regardless of cap
      // Art. XI §5(j): a matched RFA can't be traded for one year (and never
      // to the offering team).
      restrictionText: "matched offer sheet (not trade-eligible for one year)",
    });
    onDone();
  };
  const signTrade = () => {
    if (!stFullLegal) return;
    const stYears = Math.max(3, years); // S&T contracts must run 3+ seasons
    dispatchMove({
      kind: "sign_trade",
      label: `S&T: ${fa.playerName} → ${team} (${fmtM(salary)} × ${stYears}y${returnIds.size ? ` for ${returnIds.size}` : ""})`,
      playerId: fa.playerId,
      playerName: fa.playerName,
      toTeam: team,
      salary,
      years: stYears,
      fromTeam: fa.priorTeam,
      returnPlayers: [...returnIds],
    });
    onDone();
  };

  const mColor = mechColor(v.mechanism ? v.mechanism.id : null);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <button onClick={onBack} className="mb-3 self-start text-xs text-[var(--muted)] hover:text-[var(--text)]">← All free agents</button>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{fa.playerName}</span>
        {isOwn && <span className="rounded bg-[color-mix(in_srgb,var(--tier-below_cap)_20%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--tier-below_cap)]">OWN · {BIRD_LABEL[fa.birdStatus]}</span>}
        {fa.faType === "RFA" && <span className="rounded bg-[color-mix(in_srgb,var(--tier-taxpayer)_20%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--tier-taxpayer)]">RFA</span>}
      </div>
      <div className="mb-4 text-xs text-[var(--muted)]">
        {fa.yearsOfService} yrs service · last salary {fmtM(fa.lastSalary)} · {fa.priorTeam === team ? BIRD_LABEL[fa.birdStatus].toLowerCase() : `from ${teamMeta(fa.priorTeam).name}`}
      </div>

      {/* Salary picker */}
      <label className="mb-1 flex items-baseline justify-between text-xs text-[var(--muted)]">
        <span>First-year salary</span>
        <span className="tabular text-[10px]">max {fmtM(ceiling)}</span>
      </label>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[var(--muted)]">$</span>
        <input
          type="number"
          value={Math.round(salary)}
          step={100_000}
          min={floor}
          onChange={(e) => setSalary(Number(e.target.value) || 0)}
          className="tabular w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm focus:outline-none"
        />
      </div>
      <input
        type="range"
        min={floor}
        max={Math.max(ceiling, floor + 100_000)}
        step={100_000}
        value={Math.min(Math.max(salary, floor), ceiling)}
        onChange={(e) => setSalary(Number(e.target.value))}
        className="mb-1 w-full accent-[var(--accent)]"
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {presets.map((p) => {
          const active = Math.round(salary / 100_000) === Math.round(p.amt / 100_000);
          return (
            <button
              key={p.label}
              onClick={() => setSalary(p.amt)}
              className={`rounded border px-2 py-0.5 text-[10px] hover:brightness-150 ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
            >
              {p.label} {fmtM(p.amt)}
            </button>
          );
        })}
      </div>

      {/* Term picker */}
      <label className="mb-1 block text-xs text-[var(--muted)]">Contract length</label>
      <div className="mb-4 flex gap-1">
        {Array.from({ length: maxYears }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => setYears(n)}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${years === n ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
          >
            {n}yr
          </button>
        ))}
      </div>

      {/* Year-by-year breakdown */}
      <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2 text-xs">
        {rows.map((s, k) => (
          <div key={k} className="flex justify-between py-0.5">
            <span className="text-[var(--muted)]">{seasonLabel(k)}</span>
            <span className="tabular">{fmtFull(s)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
          <span>Total ({years}yr)</span>
          <span className="tabular">{fmtFull(total)}</span>
        </div>
      </div>

      {/* Live legality readout */}
      <div className="mb-4 rounded-md border p-3 text-xs" style={{ borderColor: v.legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)", background: `color-mix(in srgb, ${v.legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)"} 8%, transparent)` }}>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold" style={{ color: v.legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
            {v.legal ? `Legal — ${v.mechanism!.label}` : "Not allowed"}
          </span>
          {v.legal && v.hardCap && (
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ color: mColor, border: `1px solid ${mColor}` }}>
              hard-caps at {v.hardCap === "first_apron" ? "1st apron" : "2nd apron"}
            </span>
          )}
        </div>
        <div className="text-[var(--muted)]">{v.reason}</div>
        <div className="mt-1 text-[var(--muted)]">
          Team after: <span className="tabular text-[var(--text)]">{fmtM(afterCharge)}</span> · {afterTier.replace("_", " ")}
        </div>
        {exceedsHardCap && (
          <div className="mt-1 font-semibold text-[var(--tier-second_apron)]">
            {teamMeta(team).name} is hard-capped at {hardCap === C.firstApron ? "the first apron" : "the second apron"} ({fmtM(hardCap)}) from an earlier move — this would put them at {fmtM(afterCharge)}.
          </div>
        )}
        {fa.faType === "RFA" && !isOwn && (
          <div className="mt-1 text-[var(--tier-taxpayer)]">
            Restricted FA — {teamMeta(fa.priorTeam).name} can match this offer sheet
            {isArenasRfa ? "; 1–2 yr Arenas cap applies (year 1 ≤ NT-MLE)" : ""}.
          </div>
        )}
        {rosterFull && (
          <div className="mt-1 font-semibold text-[var(--tier-second_apron)]">
            Roster is at the 21-player offseason limit.
          </div>
        )}
        {!rosterFull && rosterCount >= 15 && (
          <div className="mt-1 text-[var(--tier-taxpayer)]">
            Roster at {rosterCount} — must be down to 15 (plus two-ways) by opening night.
          </div>
        )}
      </div>

      {/* Sign-and-trade return package */}
      {stMode && (
        <div className="mb-4 rounded-md border border-[var(--accent)] p-3 text-xs">
          <div className="mb-2 font-semibold text-[var(--accent)]">
            Sign &amp; trade from {teamMeta(fa.priorTeam).name}
            <span className="ml-2 font-normal text-[var(--muted)]">({Math.max(3, years)}yr — S&amp;T contracts must run 3+ seasons)</span>
          </div>
          <div className="mb-2 text-[var(--muted)]">
            Send {teamMeta(team).name} players to {teamMeta(fa.priorTeam).name} to match {fmtM(salary)} (they can take back ≤ {fmtM(sendMatch.maxIncoming)}):
          </div>
          <div className="mb-2 max-h-40 space-y-1 overflow-y-auto">
            {acquirerRoster
              .filter((c) => currentSalary(c) > 0 && !c.restriction)
              .map((c) => {
                const on = returnIds.has(c.playerId);
                return (
                  <button
                    key={c.playerId}
                    onClick={() => toggleReturn(c.playerId)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1 text-left"
                    style={{ background: on ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--panel-2)" }}
                  >
                    <span className="truncate">{on ? "✓ " : ""}{c.playerName}</span>
                    <span className="tabular text-[var(--muted)]">{fmtM(currentSalary(c))}</span>
                  </button>
                );
              })}
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-1">
            <span className="text-[var(--muted)]">Return salary</span>
            <span className="tabular font-semibold" style={{ color: senderOk ? "var(--text)" : "var(--tier-second_apron)" }}>{fmtM(returnSalary)}</span>
          </div>
          <div className="mt-1" style={{ color: stFullLegal ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
            {stFullLegal
              ? "Legal sign-and-trade — acquirer hard-capped at the first apron."
              : !acquirerSt.legal
                ? acquirerSt.reason
                : !acquirerOk
                  ? `${teamMeta(team).name} can only take in ${fmtM(acquirerMatch.maxIncoming)} for ${fmtM(returnSalary)} out (${acquirerMatch.ruleLabel}) — add salary to the return package or open cap room.`
                  : `${teamMeta(fa.priorTeam).name} can't take back ${fmtM(returnSalary)} for ${fmtM(salary)} (max ${fmtM(sendMatch.maxIncoming)}).`}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {stMode ? (
          <>
            <button onClick={() => setStMode(false)} className="rounded-md border border-[var(--border)] px-3 py-2.5 text-sm font-semibold text-[var(--muted)]">
              Cancel
            </button>
            <button
              onClick={signTrade}
              disabled={!stFullLegal}
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Execute S&amp;T{returnIds.size ? ` (${returnIds.size} back)` : ""}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={sign}
              disabled={!legalSign}
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {fa.faType === "RFA" && !isOwn ? "Offer sheet — they decline" : `Sign ${fmtM(salary)}${years > 1 ? ` × ${years}yr` : ""}`}
            </button>
            {fa.faType === "RFA" && !isOwn && (
              <button
                onClick={matchOfferSheet}
                disabled={!legalSign}
                title={`${teamMeta(fa.priorTeam).name} match the offer sheet — ${fa.playerName} stays at these exact terms`}
                className="rounded-md border border-[var(--tier-taxpayer)] px-3 py-2.5 text-sm font-bold text-[var(--tier-taxpayer)] hover:bg-[var(--tier-taxpayer)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                {fa.priorTeam} match
              </button>
            )}
            {canOfferSt && (
              <button onClick={() => { setStMode(true); setYears((y) => Math.max(3, y)); }} className="rounded-md border border-[var(--accent)] px-3 py-2.5 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-white">
                Sign &amp; Trade
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Extend a rostered player's contract (veteran extension — 140% rule). */
function ExtendDrawer({
  playerId,
  playerName,
  team,
  lg,
  onClose,
}: {
  playerId: string;
  playerName: string;
  team: string;
  lg: LG;
  onClose: () => void;
}) {
  const contract = lg.contracts.find((c) => c.playerId === playerId);
  const current = contract ? currentSalary(contract) : 0;
  const yos = experienceOf(playerId);
  // Existing years from the active season forward, and the FINAL-year salary —
  // the veteran-extension 140% ceiling is computed off the last year of the
  // current deal, not the current year.
  const remainingYearRows = contract
    ? [...contract.years]
        .filter((y) => y.leagueYear >= YEAR_STR)
        .sort((a, b) => a.leagueYear.localeCompare(b.leagueYear))
    : [];
  const remainingYears = remainingYearRows.length;
  const finalYearSalary = remainingYears
    ? remainingYearRows[remainingYears - 1]!.salary
    : current;
  const extMax = veteranExtensionMax(finalYearSalary, yos, C);
  const minYos = Math.min(Math.max(Math.floor(yos), 0), 10);
  const floor = C.minimumSalaries[minYos] ?? 1_000_000;
  const ceiling = Math.max(extMax, floor);
  // Total contract (remaining + extension) can't exceed the CBA's 5-year max.
  const maxExtYears = Math.max(1, Math.min(4, 5 - remainingYears));
  // Extension years start the season after the current contract's last year.
  const lastYear = contract
    ? contract.years.reduce((mx, y) => (y.leagueYear > mx ? y.leagueYear : mx), YEAR_STR)
    : YEAR_STR;
  const startYr = Number(lastYear.slice(0, 4)) + 1;
  const extSeason = (k: number) =>
    `${startYr + k}-${String((startYr + 1 + k) % 100).padStart(2, "0")}`;

  const [salary, setSalary] = useState<number>(
    Math.max(floor, Math.min(round100k(finalYearSalary), ceiling)),
  );
  const [years, setYears] = useState<number>(Math.min(3, maxExtYears));
  const clamped = Math.max(floor, Math.min(salary, ceiling));
  const rows = Array.from({ length: years }, (_, k) => Math.round(clamped * (1 + 0.08 * k)));
  const total = rows.reduce((a, b) => a + b, 0);

  const doExtend = () => {
    dispatchMove({
      kind: "extend",
      label: `Extend: ${playerName} (${fmtM(clamped)} × ${years}y)`,
      playerId,
      playerName,
      salary: clamped,
      years,
    });
    onClose();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-[-8px_0_24px_rgba(33,29,19,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <TeamLogo id={team} size={24} />
          <div className="text-sm font-semibold">Extend contract — {teamMeta(team).name}</div>
        </div>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-1 text-base font-semibold">{playerName}</div>
        <div className="mb-4 text-xs text-[var(--muted)]">
          {yos} yrs service · current {fmtM(current)} · extension max {fmtM(ceiling)} (140% rule)
        </div>

        <label className="mb-1 flex items-baseline justify-between text-xs text-[var(--muted)]">
          <span>New first-year salary</span>
          <span className="tabular text-[10px]">max {fmtM(ceiling)}</span>
        </label>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[var(--muted)]">$</span>
          <input
            type="number"
            value={Math.round(salary)}
            step={100_000}
            min={floor}
            onChange={(e) => setSalary(Number(e.target.value) || 0)}
            className="tabular w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm focus:outline-none"
          />
        </div>
        <input
          type="range"
          min={floor}
          max={Math.max(ceiling, floor + 100_000)}
          step={100_000}
          value={clamped}
          onChange={(e) => setSalary(Number(e.target.value))}
          className="mb-4 w-full accent-[var(--accent)]"
        />

        <label className="mb-1 block text-xs text-[var(--muted)]">
          Extension length <span className="text-[var(--muted)]">· {remainingYears}yr left, max +{maxExtYears} (5yr total)</span>
        </label>
        <div className="mb-4 flex gap-1">
          {Array.from({ length: maxExtYears }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setYears(n)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${years === n ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
            >
              +{n}yr
            </button>
          ))}
        </div>

        <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2 text-xs">
          {rows.map((s, k) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-[var(--muted)]">{extSeason(k)}</span>
              <span className="tabular">{fmtFull(s)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
            <span>New money ({years}yr)</span>
            <span className="tabular">{fmtFull(total)}</span>
          </div>
        </div>

        <button
          onClick={doExtend}
          className="rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          Extend · {fmtM(clamped)} × {years}yr
        </button>
      </div>
    </div>
  );
}

/** AI trade finder: pick a target + acquirer, get ranked legal packages. */
function TradeFinderDrawer({
  board,
  lg,
  onClose,
  onLoad,
}: {
  board: string[];
  lg: LG;
  onClose: () => void;
  onLoad: (acquirer: string, seller: string, targetId: string, playerIds: string[]) => void;
}) {
  const [acquirer, setAcquirer] = useState<string>(board[0] ?? TEAM_IDS[0]!);
  const [q, setQ] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);

  // Rostered players (with a salary) other than the acquirer's, for the target search.
  const candidates = useMemo(
    () =>
      lg.contracts
        .filter((c) => c.teamId !== acquirer && currentSalary(c) > 0 && !c.restriction)
        .sort((a, b) => currentSalary(b) - currentSalary(a)),
    [lg.contracts, acquirer],
  );
  const list = q
    ? candidates.filter((c) => c.playerName.toLowerCase().includes(q.toLowerCase())).slice(0, 40)
    : candidates.slice(0, 40);

  const target = targetId ? lg.contracts.find((c) => c.playerId === targetId) : null;
  const packages = useMemo(
    () => (targetId ? findTradePackages(lg.data, acquirer, targetId) : []),
    [lg.data, acquirer, targetId],
  );

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-[-8px_0_24px_rgba(33,29,19,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="text-sm font-semibold">Trade finder</div>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
      </div>

      <div className="border-b border-[var(--border)] p-3">
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--muted)]">Acquiring team</label>
        <select
          value={acquirer}
          onChange={(e) => { setAcquirer(e.target.value); setTargetId(null); }}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm"
        >
          {TEAM_IDS.map((t) => (
            <option key={t} value={t}>{teamMeta(t).name}</option>
          ))}
        </select>
      </div>

      {target ? (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-3">
            <div className="flex items-center gap-2 text-sm">
              <ValuePill c={target} />
              <span className="font-semibold">{target.playerName}</span>
              <span className="tabular text-xs text-[var(--muted)]">{fmtM(currentSalary(target))} · {teamMeta(target.teamId).name}</span>
            </div>
            <button onClick={() => setTargetId(null)} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">change</button>
          </div>
          <div className="p-3 text-xs text-[var(--muted)]">
            {packages.length
              ? `${packages.length} legal package${packages.length > 1 ? "s" : ""} from ${teamMeta(acquirer).name} (ranked by salary fit, then least value given):`
              : `No legal ${teamMeta(acquirer).name} package matches ${target.playerName} (try renouncing/adjusting or a different acquirer).`}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
            {packages.map((pkg, i) => (
              <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2.5">
                <div className="mb-1.5 space-y-1">
                  {pkg.players.map((p) => (
                    <div key={p.playerId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ValuePill c={lg.contracts.find((x) => x.playerId === p.playerId)} />
                        <span className="truncate">{p.playerName}</span>
                      </span>
                      <span className="tabular text-xs text-[var(--muted)]">{fmtM(p.salary)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-1.5 text-[11px] text-[var(--muted)]">
                  <span className="tabular">out {fmtM(pkg.outSalary)} · value {pkg.valueGiven}</span>
                  <button
                    onClick={() => onLoad(acquirer, pkg.seller, target.playerId, pkg.players.map((p) => p.playerId))}
                    className="rounded border border-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-white"
                  >
                    Load into board
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a target player…" className="m-3 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm focus:outline-none" />
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {list.map((c) => (
              <button key={c.playerId} onClick={() => setTargetId(c.playerId)} className="mb-1 flex w-full items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] px-3 py-2 text-left text-sm hover:brightness-125">
                <span className="flex min-w-0 items-center gap-2">
                  <ValuePill c={c} />
                  <span className="truncate">{c.playerName}</span>
                  <span className="text-[10px] text-[var(--muted)]">{c.teamId}</span>
                </span>
                <span className="tabular text-xs text-[var(--muted)]">{fmtM(currentSalary(c))}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

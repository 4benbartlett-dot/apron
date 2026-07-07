"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { validateTrade, violatesStepien, type Trade, type TeamTradeSummary, type Contract } from "@apron/cba-engine";
import { C, TEAM_IDS, teamMeta, currentSalary, tpeLedger, fitTpePlan, stepienFindingFor, hardCapDetailFor } from "@/lib/league";
import { fmtM as fmtMoney } from "@/lib/format";
import { decodeTradeParam, pickShareLabel } from "@/lib/trade-share";
import { shortPlayerName } from "@/lib/names";
import { useLeague, dispatchMove } from "@/lib/store";
import { fmtM, fmtFull } from "@/lib/format";
import { Thermometer } from "@/components/Thermometer";
import { TierBadge } from "@/components/TierBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { TradeTray, useTrayVisible, type TrayHaul } from "@/components/TradeTray";
import { ShareCardModal } from "@/components/ShareCardModal";
import { track } from "@/lib/analytics";
import { explainBlocked } from "@/lib/tradeFix";
import { TradeDocket, buildDocket, buildChecks, DocketWhy, MoveTriggers, tradeConsequences } from "@/components/TradeDocket";
import { ImpactPill, PosBadge } from "@/components/PlayerTags";

interface Sel {
  from: string;
  to: string;
}



export default function TradeBuilder() {
  const lg = useLeague();
  const [teams, setTeams] = useState<string[]>(["BOS", "LAL"]);
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [pickSel, setPickSel] = useState<Record<string, Sel>>({});
  const [shareOpen, setShareOpen] = useState(false);

  const togglePick = (pickId: string, from: string) =>
    setPickSel((s) => {
      const next = { ...s };
      if (next[pickId]) delete next[pickId];
      else next[pickId] = { from, to: teams.find((t) => t !== from) ?? from };
      return next;
    });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("t");
    if (t) {
      // The full share token: teams, player legs, AND pick legs.
      const d = decodeTradeParam(t);
      if (d) {
        setTeams(d.teams);
        setSel(Object.fromEntries(d.players.map((m) => [m.playerId, { from: m.from, to: m.to }])));
        setPickSel(Object.fromEntries(d.picks.map((m) => [m.id, { from: m.from, to: m.to }])));
        // Land on the card view — the screen from the screenshot they clicked.
        // Closing it drops into the builder with this trade already staged.
        if (d.players.length || d.picks.length) {
          setShareOpen(true);
          track("trade_link_open");
        }
        return;
      }
    }
    const a = p.get("a");
    if (a && TEAM_IDS.includes(a)) setTeams((ts) => [a, ts.find((x) => x !== a) ?? "LAL"]);
  }, []);

  const toggle = (playerId: string, from: string) =>
    setSel((s) => {
      const next = { ...s };
      if (next[playerId]) delete next[playerId];
      else next[playerId] = { from, to: teams.find((t) => t !== from) ?? from };
      return next;
    });
  const setDest = (playerId: string, to: string) =>
    setSel((s) => ({ ...s, [playerId]: { ...s[playerId]!, to } }));
  const addTeam = (id: string) =>
    setTeams((ts) => (ts.includes(id) || ts.length >= 5 ? ts : [...ts, id]));
  const removeTeam = (id: string) =>
    setTeams((ts) => {
      if (ts.length <= 2) return ts;
      setSel((s) => {
        const next = { ...s };
        for (const [pid, mv] of Object.entries(next)) if (mv.from === id || mv.to === id) delete next[pid];
        return next;
      });
      return ts.filter((t) => t !== id);
    });

  const { trade, verdict, byTeam } = useMemo(() => {
    const players = Object.entries(sel)
      .filter(([, mv]) => teams.includes(mv.from) && teams.includes(mv.to))
      .map(([playerId, mv]) => ({ playerId, from: mv.from, to: mv.to }));
    // Kept holds consume below-cap absorption room (not apron status).
    const capHolds = Object.fromEntries(teams.map((t) => [t, lg.teamHolds(t)]));
    let tr: Trade = { teams, players, capHolds };
    let v = validateTrade(lg.data, tr, C);
    // Failing matching? Try absorbing incoming players into standing TPEs.
    if (!v.legal && v.violations.some((x) => x.ruleId === "salary_matching")) {
      const incomingByTeam: Record<string, { playerId: string; salary: number }[]> = {};
      for (const p of players) {
        const c = lg.contracts.find((x) => x.playerId === p.playerId);
        (incomingByTeam[p.to] ??= []).push({ playerId: p.playerId, salary: c ? currentSalary(c) : 0 });
      }
      const plan = fitTpePlan(v.teams, incomingByTeam, tpeLedger(lg.moves));
      if (plan) {
        tr = { ...tr, tpeUse: plan };
        v = validateTrade(lg.data, tr, C);
      }
    }
    return { trade: tr, verdict: v, byTeam: new Map(v.teams.map((t) => [t.teamId, t])) };
  }, [teams, sel, lg]);

  const hasMoves = trade.players.length > 0 || Object.keys(pickSel).length > 0;

  // Parity with the main board: the Stepien check runs against the session
  // pick ledger, and a hard cap triggered by an earlier move binds here too.
  const extraViolations = useMemo(() => {
    const out: string[] = [];
    const outBy: Record<string, string[]> = {};
    const inBy: Record<string, string[]> = {};
    const touched = new Set<string>();
    for (const [id, mv] of Object.entries(pickSel)) {
      (outBy[mv.from] ??= []).push(id);
      (inBy[mv.to] ??= []).push(id);
      touched.add(mv.from);
      touched.add(mv.to);
    }
    for (const t of touched) {
      const uncovered = lg.yearsWithoutFirst(t, outBy[t] ?? [], inBy[t] ?? []);
      if (violatesStepien(uncovered)) {
        const outYears = (outBy[t] ?? [])
          .filter((id) => id.endsWith("|1"))
          .map((id) => Number(id.split("|")[1]));
        const finding = stepienFindingFor(t, uncovered, outYears);
        if (finding) out.push(finding.message);
      }
    }
    for (const t of verdict.teams) {
      const detail = hardCapDetailFor(t.teamId, lg.hardCapOf(t.teamId));
      if (detail && t.postTradeSalary > detail.line + 1) {
        out.push(
          detail.source === "real"
            ? `${teamMeta(t.teamId).name} is hard-capped at ${fmtMoney(detail.line)} all season by its real July moves${detail.label ? ` (${detail.label})` : ""} — this trade would put them at ${fmtMoney(t.postTradeSalary)}.`
            : `${teamMeta(t.teamId).name} is hard-capped at ${fmtMoney(detail.line)} from a move you made this offseason — this trade would put them at ${fmtMoney(t.postTradeSalary)}.`,
        );
      }
    }
    return out;
  }, [pickSel, verdict, lg]);
  const fullyLegal = verdict.legal && extraViolations.length === 0;

  // Sticky tray mirrors the verdict banner once it scrolls out of view.
  const verdictRef = useRef<HTMLDivElement>(null);
  const trayVisible = useTrayVisible(verdictRef, hasMoves);
  const salaryOf = (id: string) => {
    const c = lg.contracts.find((x) => x.playerId === id);
    return c ? currentSalary(c) : 0;
  };
  const docketTeams = useMemo(
    () => buildDocket(trade.players, pickSel, verdict.teams, lg.playerName, salaryOf, trade.tpeUse),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trade, pickSel, verdict, lg],
  );
  const docketChecks = useMemo(
    () =>
      buildChecks({
        legal: fullyLegal,
        involved: verdict.teams.filter((t) => docketTeams.some((d) => d.teamId === t.teamId)),
        tpeUse: trade.tpeUse,
        violationReasons: verdict.violations.map((v) => v.reason),
        extraViolations,
        hasPicks: Object.keys(pickSel).length > 0,
      }),
    [fullyLegal, verdict, docketTeams, trade, pickSel, extraViolations],
  );
  const triggers = useMemo(
    () => (fullyLegal ? tradeConsequences(verdict.teams, trade.tpeUse, lg.teamHolds) : []),
    [fullyLegal, verdict, trade, lg],
  );
  const docketFix = useMemo(
    () => (fullyLegal ? null : explainBlocked(verdict, extraViolations, C, lg.teamHolds).fixes[0] ?? null),
    [fullyLegal, verdict, extraViolations, lg],
  );
  const trayHauls = useMemo<TrayHaul[]>(() => {
    const m: Record<string, { labels: string[]; tools: string[] }> = {};
    const row = (team: string) => (m[team] ??= { labels: [], tools: [] });
    for (const p of trade.players) row(p.to).labels.push(shortPlayerName(lg.playerName(p.playerId)));
    for (const [id, mv] of Object.entries(pickSel)) row(mv.to).labels.push(pickShareLabel(id));
    for (const [team, use] of Object.entries(trade.tpeUse ?? {})) {
      row(team).tools.push(use.label ?? "TPE");
    }
    return Object.entries(m).map(([team, haul]) => ({ team, ...haul }));
  }, [trade, pickSel, lg]);

  const execute = () => {
    const names = trade.players.map((p) => shortPlayerName(lg.playerName(p.playerId)));
    const pickMoves = Object.entries(pickSel).map(([id, mv]) => ({ id, to: mv.to }));
    dispatchMove({
      kind: "trade",
      label: `Trade: ${names.join(", ")}${pickMoves.length ? ` +${pickMoves.length} pick${pickMoves.length > 1 ? "s" : ""}` : ""}`,
      players: trade.players.map((p) => ({ playerId: p.playerId, to: p.to })),
      picks: pickMoves,
      tpeUse: trade.tpeUse,
    });
    setSel({});
    setPickSel({});
  };

  const available = TEAM_IDS.filter((t) => !teams.includes(t));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trade Machine</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Up to 5 teams. Legality enforced under the 2023 CBA — apron rules
            included. Executed trades join the same offseason session as the main board.
          </p>
        </div>
        {hasMoves && (
          <div className="flex gap-2">
            <button onClick={() => setShareOpen(true)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--panel-2)]">
              Share card
            </button>
            {fullyLegal && (
              <button
                onClick={execute}
                className="rounded-md border border-[var(--tier-below_cap)] bg-[color-mix(in_srgb,var(--tier-below_cap)_15%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--tier-below_cap)] hover:bg-[color-mix(in_srgb,var(--tier-below_cap)_25%,transparent)]"
              >
                Execute trade
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {teams.map((id) => (
          <span key={id} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-sm font-semibold">
            <TeamLogo id={id} size={18} />
            {teamMeta(id).name}
            {teams.length > 2 && (
              <button onClick={() => removeTeam(id)} className="text-[var(--muted)] hover:text-[var(--tier-second_apron)]">✕</button>
            )}
          </span>
        ))}
        {teams.length < 5 && (
          <select value="" onChange={(e) => e.target.value && addTeam(e.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-sm text-[var(--muted)]">
            <option value="">+ Add team</option>
            {available.map((id) => (
              <option key={id} value={id}>{teamMeta(id).name}</option>
            ))}
          </select>
        )}
      </div>

      <div ref={verdictRef} className="md:sticky md:top-[56px] md:z-10 md:bg-[var(--bg)] md:pb-2" style={{ scrollMarginTop: 60 }}>
        <VerdictBanner hasMoves={hasMoves} legal={fullyLegal} violations={[...verdict.violations.map((v) => v.reason), ...extraViolations]} tpeUse={trade.tpeUse} />
        {hasMoves && (
          <>
            <div className="mt-2">
              <TradeDocket teams={docketTeams} />
            </div>
            {triggers.length > 0 && (
              <div className="mt-2">
                <MoveTriggers items={triggers} />
              </div>
            )}
            <div className="mt-2">
              <DocketWhy legal={fullyLegal} checks={docketChecks} fix={docketFix} />
            </div>
          </>
        )}
      </div>
      {hasMoves && (
        <TradeTray
          hauls={trayHauls}
          legal={fullyLegal}
          visible={trayVisible}
          onReview={() => verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          onShare={() => setShareOpen(true)}
        />
      )}
      {shareOpen && hasMoves && (
        <ShareCardModal
          trade={trade}
          picks={Object.entries(pickSel).map(([id, mv]) => ({ id, from: mv.from, to: mv.to }))}
          verdict={verdict}
          extraViolations={extraViolations}
          holdsOf={lg.teamHolds}
          nameOf={lg.playerName}
          salaryOf={salaryOf}
          onClose={() => setShareOpen(false)}
        />
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((id) => (
          <TeamPanel
            key={id}
            teamId={id}
            otherTeams={teams.filter((t) => t !== id)}
            players={lg.roster(id)}
            picks={lg.picksOf(id)}
            pickSel={pickSel}
            onTogglePick={togglePick}
            sel={sel}
            onToggle={toggle}
            onDest={setDest}
            summary={byTeam.get(id)}
          />
        ))}
      </div>

      {hasMoves && (
        <div className="panel mt-4 p-4">
          <div className="mb-2 text-sm font-semibold">Why this verdict</div>
          <ul className="space-y-2 text-sm">
            {verdict.checks.map((ch, i) => (
              <li key={i} className="flex gap-2">
                <span className={ch.ok ? "text-[var(--tier-below_cap)]" : "text-[var(--tier-second_apron)]"}>{ch.ok ? "✓" : "✕"}</span>
                <span>
                  <span>{ch.reason}</span>
                  <span className="block text-[11px] text-[var(--muted)]">{ch.citation}</span>
                </span>
              </li>
            ))}
            {extraViolations.map((reason, i) => (
              <li key={`x${i}`} className="flex gap-2">
                <span className="text-[var(--tier-second_apron)]">✕</span>
                <span>
                  <span>{reason}</span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    {/Stepien/.test(reason)
                      ? "NBA rule (Stepien) — enforced against the session pick ledger."
                      : "2023 CBA — a triggered hard cap binds for the remainder of the league year."}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VerdictBanner({
  hasMoves,
  legal,
  violations,
  tpeUse,
}: {
  hasMoves: boolean;
  legal: boolean;
  violations: string[];
  tpeUse?: Trade["tpeUse"];
}) {
  if (!hasMoves)
    return <Banner color="var(--muted)" title="Build a trade" sub="Click players to send them out; pick where they land if 3+ teams." />;
  if (legal) {
    const tpeDetails = Object.entries(tpeUse ?? {}).map(
      ([team, use]) => `${team} uses ${fmtM(use.amount)} ${use.label ?? "TPE"}`,
    );
    return (
      <Banner
        color="var(--tier-below_cap)"
        title="LEGAL TRADE"
        sub={
          tpeDetails.length
            ? `${tpeDetails.join(" · ")}; remaining salary matches under the 2023 CBA.`
            : "Satisfies all salary-matching and apron rules. Execute to add it to your offseason."
        }
      />
    );
  }
  return <Banner color="var(--tier-second_apron)" title="ILLEGAL TRADE" sub={violations[0]} />;
}

function Banner({ color, title, sub }: { color: string; title: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <div className="text-lg font-bold" style={{ color }}>{title}</div>
      {sub && <div className="mt-0.5 text-sm">{sub}</div>}
    </div>
  );
}

function TeamPanel({
  teamId,
  otherTeams,
  players,
  picks,
  pickSel,
  onTogglePick,
  sel,
  onToggle,
  onDest,
  summary,
}: {
  teamId: string;
  otherTeams: string[];
  players: Contract[];
  picks: { id: string; label: string }[];
  pickSel: Record<string, Sel>;
  onTogglePick: (id: string, from: string) => void;
  sel: Record<string, Sel>;
  onToggle: (id: string, from: string) => void;
  onDest: (id: string, to: string) => void;
  summary?: TeamTradeSummary;
}) {
  const meta = teamMeta(teamId);
  const pre = summary?.preTradeSalary ?? 0;
  const post = summary?.postTradeSalary ?? pre;

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <TeamLogo id={teamId} size={30} />
          <div>
          <div className="text-base font-semibold">{meta.name}</div>
          {summary && (
            <div className="mt-0.5 text-xs text-[var(--muted)] tabular">
              {fmtFull(post)}
              {post !== pre && ` (${post > pre ? "+" : ""}${fmtM(post - pre)})`}
            </div>
          )}
          </div>
        </div>
        {summary && <TierBadge tier={summary.postTradeTier} />}
      </div>

      {summary && (
        <div className="mt-3">
          <Thermometer salary={pre} ghost={post} c={C} />
        </div>
      )}

      {summary && (summary.outgoingSalary > 0 || summary.incomingSalary > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-[var(--panel-2)] p-2">
            <div className="text-[var(--muted)]">Sends out</div>
            <div className="tabular font-semibold">{fmtM(summary.outgoingSalary)}</div>
          </div>
          <div className="rounded-md bg-[var(--panel-2)] p-2">
            <div className="text-[var(--muted)]">Takes back (max {fmtM(summary.maxIncomingAllowed)})</div>
            <div className="tabular font-semibold">{fmtM(summary.incomingSalary)}</div>
          </div>
        </div>
      )}

      <div className="mt-3 max-h-[360px] space-y-1 overflow-y-auto pr-1">
        {players.map((c) => {
          const mv = sel[c.playerId];
          const isOut = !!mv;
          return (
            <div
              key={c.playerId}
              className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm"
              style={{ background: isOut ? "color-mix(in srgb, var(--tier-second_apron) 18%, transparent)" : "var(--panel-2)" }}
            >
              <button onClick={() => onToggle(c.playerId, teamId)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <ImpactPill c={c} />
                <PosBadge playerId={c.playerId} />
                <span className="truncate">{c.playerName}</span>
                {c.restriction && (
                  <span title={c.restriction} className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 16%, transparent)" }}>
                    NO-TRADE
                  </span>
                )}
                {c.noAggregate && !c.restriction && (
                  <span title="Acquired this offseason — can't be aggregated for ~2 months" className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ color: "var(--tier-taxpayer)", background: "color-mix(in srgb, var(--tier-taxpayer) 16%, transparent)" }}>
                    NO-AGG
                  </span>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {isOut && otherTeams.length > 1 ? (
                  <select value={mv.to} onChange={(e) => onDest(c.playerId, e.target.value)} className="rounded border border-[var(--border)] bg-[var(--panel)] px-1 py-0.5 text-[10px]">
                    {otherTeams.map((t) => (
                      <option key={t} value={t}>→ {t}</option>
                    ))}
                  </select>
                ) : (
                  isOut && <span className="text-[10px] font-bold text-[var(--tier-second_apron)]">→ {mv.to}</span>
                )}
                <span className="tabular text-[var(--muted)]">{currentSalary(c) > 0 ? fmtM(currentSalary(c)) : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-[var(--border)] pt-2">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          Draft picks owned
        </div>
        <div className="flex flex-wrap gap-1">
          {picks.map((p) => {
            const mv = pickSel[p.id];
            const out = !!mv;
            return (
              <button
                key={p.id}
                onClick={() => onTogglePick(p.id, teamId)}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: out
                    ? "color-mix(in srgb, var(--tier-second_apron) 20%, transparent)"
                    : "var(--panel-2)",
                  color: out ? "var(--tier-second_apron)" : "var(--muted)",
                }}
              >
                {p.label}
                {out ? ` → ${mv.to}` : ""}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

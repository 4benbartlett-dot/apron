"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { spendingPower } from "@apron/cba-engine";
import { DRAFT_PICKS, PICK_RIGHTS } from "@apron/data";
import { C, TEAM_IDS, teamMeta, teamProjection, feedStateOf, consumedFor } from "@/lib/league";
import { useLeague } from "@/lib/store";
import { fmtM, fmtFull } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { Thermometer } from "@/components/Thermometer";
import { DepthChart } from "@/components/DepthChart";
import { TeamProfile } from "@/components/TeamProfile";
import { ImpactPill, PosBadge } from "@/components/PlayerTags";

export default function TeamWarRoom() {
  const params = useParams();
  const id = String(params.id || "").toUpperCase();
  const lg = useLeague();

  if (!TEAM_IDS.includes(id)) {
    return <div className="text-[var(--muted)]">Unknown team “{id}”.</div>;
  }

  const meta = teamMeta(id);
  const sheet = lg.capSheet(id);
  const holds = lg.teamHolds(id);
  const committed = lg.teamSalary(id);
  const feed = feedStateOf(id);
  const consumed = consumedFor(lg.moves, id);
  // Match the offseason board: a team that operated under the cap has its
  // MLEs/BAE dead, and exceptions the real July already spent stay spent.
  const power = spendingPower(committed + holds, C, { apronSalary: committed, roomTeam: feed.roomTeam, consumed });
  // The LIVE hard cap: the real-July feed AND anything the user's own staged
  // moves triggered this session (same source the board enforces). A team the
  // user just hard-capped can't cross that line with any further addition.
  const liveHardCap = lg.hardCapOf(id);
  const roster = lg.roster(id);
  const picks = DRAFT_PICKS[id] ?? { incoming: [], outgoing: [] };
  const spaceAfterHolds = C.salaryCap - committed - holds;
  const proj = teamProjection(id, lg.contracts);

  // Room under the binding hard cap: a cap already triggered (this session or
  // real July) caps EVERY addition; a mechanism whose USE would trigger a cap
  // caps to that apron. Take the tightest.
  const line = (n: number, hc: "first_apron" | "second_apron" | null) => {
    const caps = [n];
    if (Number.isFinite(liveHardCap)) caps.push(Math.max(0, liveHardCap - committed));
    if (hc === "first_apron") caps.push(Math.max(0, C.firstApron - committed));
    else if (hc === "second_apron") caps.push(Math.max(0, C.secondApron - committed));
    return Math.min(...caps);
  };

  // "What can this team do" summary — reflects what the real July already used,
  // and says WHY the team is limited.
  const canDo: string[] = [];
  if (spaceAfterHolds > 1_000_000)
    canDo.push(`~${fmtM(spaceAfterHolds)} in cap space (after renouncing/holding its own free agents).`);
  const topExc = power.mechanisms.find((m) => m.id !== "minimum" && m.id !== "cap_room");
  if (topExc)
    canDo.push(`Can add an outside free agent up to ${fmtM(Math.min(topExc.maxSalary, line(topExc.maxSalary, topExc.hardCap)))} via the ${topExc.label}.`);
  else
    canDo.push("Outside free agents can only be added on minimum deals — its cap room and exceptions are already spent or dead for the year.");

  // Why it's limited: what the audited July actually did.
  if (feed.roomTeam)
    canDo.push(`Operated under the cap this July${consumed.room_mle ? " (used its Room MLE)" : ""}, so the non-taxpayer MLE and bi-annual exception are dead for the season (Art. VII §6(n)).`);
  if (Number.isFinite(liveHardCap)) {
    // A cap tighter than the real-July feed means the user's own staged move
    // triggered it; attribute it so the "why" stays honest.
    const sessionTriggered = !Number.isFinite(feed.hardCap) || liveHardCap < feed.hardCap;
    const src = sessionTriggered ? "a move you've staged this session" : feed.hardCapSource ? `the ${feed.hardCapSource}` : "";
    canDo.push(`Hard-capped at the ${liveHardCap === C.firstApron ? "first" : "second"} apron${src ? ` — triggered by ${src}` : ""}, so it can't cross that line the rest of the season.`);
  }

  if (sheet.isOverSecondApron)
    canDo.push("Over the second apron: can't aggregate salaries, no mid-level, no cash out, and its future first-rounder can be frozen.");
  else if (sheet.isOverFirstApron)
    canDo.push("Over the first apron: capped at 100% salary matching in trades.");
  else if (!feed.roomTeam)
    canDo.push("Below the first apron: full expanded salary-matching is available.");
  canDo.push(`Draft capital: ${picks.incoming.length} extra incoming picks, owes ${picks.outgoing.length}.`);

  return (
    <div>
      <div className="mb-5 flex items-center gap-4">
        <TeamLogo id={id} size={56} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{meta.name}</h1>
          <div className="mt-1 flex items-center gap-3">
            <TierBadge tier={sheet.tier} />
            <span className="tabular text-sm text-[var(--muted)]">
              {fmtFull(committed)} committed
              {holds > 0 && ` + ${fmtM(holds)} FA holds`}
            </span>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href={`/?team=${id}`} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--panel-2)]">Trade →</Link>
          <Link href={`/?sign=${id}`} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--panel-2)]">Sign FAs →</Link>
        </div>
      </div>

      <div className="panel mb-4 p-4">
        <div className="mb-2 text-sm font-semibold">What {meta.name} can do this offseason</div>
        <ul className="space-y-1.5 text-sm">
          {canDo.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--tier-below_cap)]">›</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Thermometer salary={committed + holds} c={C} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {power.mechanisms.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs font-semibold">
              {m.label}
              <span className="tabular text-[var(--muted)]">{fmtM(Math.min(m.maxSalary, line(m.maxSalary, m.hardCap)))}</span>
            </span>
          ))}
        </div>
      </div>

      {proj && (
        <div className="panel mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div>
            <div className="label !text-[10px]">Projected record</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tabular text-2xl font-bold">{proj.projWins}-{82 - proj.projWins}</span>
              {proj.deltaWins !== 0 && (
                <span className="tabular text-sm font-semibold" style={{ color: proj.deltaWins > 0 ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
                  {proj.deltaWins > 0 ? "+" : ""}{proj.deltaWins} vs current
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="label !text-[10px]">Projected net rating</div>
            <div className="tabular mt-1 flex items-baseline gap-2 text-lg font-semibold">
              {proj.projNrtg >= 0 ? "+" : ""}{proj.projNrtg.toFixed(1)}
              {proj.deltaNrtg !== 0 && (
                <span className="text-xs" style={{ color: proj.deltaNrtg > 0 ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
                  ({proj.deltaNrtg > 0 ? "+" : ""}{proj.deltaNrtg.toFixed(1)})
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="label !text-[10px]">Current baseline</div>
            <div className="tabular mt-1 text-sm text-[var(--muted)]">{proj.baseWins} wins · {proj.baseNrtg >= 0 ? "+" : ""}{proj.baseNrtg.toFixed(1)} net</div>
          </div>
          <div className="w-full text-[11px] text-[var(--muted)] sm:w-auto sm:flex-1 sm:text-right">
            <a href="/standings" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text)]">Full standings</a> · models the position-aware rotation, a real-age aging curve, and team fit (spacing, playmaking, defensive pairings); a talent-on-hand projection, not a full-season forecast (no coaching or playoff translation).
          </div>
        </div>
      )}

      <div className="panel mb-4 p-4">
        <div className="mb-2 text-sm font-semibold">Team profile <span className="text-[var(--muted)]">· on-court identity + fit</span></div>
        <TeamProfile roster={roster} />
      </div>

      <div className="panel mb-4 p-4">
        <div className="mb-2 text-sm font-semibold">Projected rotation <span className="text-[var(--muted)]">· minutes by position, best players first</span></div>
        <DepthChart roster={roster} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-2 text-sm font-semibold">Roster <span className="text-[var(--muted)]">({roster.length})</span></div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {roster.map((c) => (
              <div key={c.playerId} className="flex items-center justify-between rounded-md bg-[var(--panel-2)] px-2.5 py-1.5 text-sm">
                <span className="flex items-center gap-1.5 truncate">
                  <ImpactPill c={c} />
                  <PosBadge playerId={c.playerId} />
                  <span className="truncate">{c.playerName}</span>
                  {c.restriction && <span className="shrink-0 text-[9px] font-bold text-[var(--tier-second_apron)]">NO-TRADE</span>}
                </span>
                <span className="tabular text-[var(--muted)]">{fmtM(salaryOf(c))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <div className="mb-2 text-sm font-semibold">Draft capital</div>
          {(() => {
            const rights = PICK_RIGHTS[id];
            const obl = new Map((rights?.ownFirstObligations ?? []).map((o) => [o.year, o]));
            const ownYears = [2027, 2028, 2029, 2030, 2031, 2032];
            const chip = (color: string, text: string, title: string, key: string) => (
              <span key={key} title={title} className="tabular rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium"
                style={{ borderColor: color, color, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>{text}</span>
            );
            return (
              <>
                <div className="label mb-1 !text-[10px]">Own first-rounders</div>
                <div className="mb-3 flex flex-wrap gap-1">
                  {ownYears.map((y) => {
                    const o = obl.get(y);
                    const color = !o ? "var(--tier-below_cap)" : o.status === "owed" ? "var(--tier-second_apron)" : "var(--tier-taxpayer)";
                    const label = !o ? "kept" : o.status === "owed" ? `→ ${o.to ?? ""}` : o.status === "protected" ? `prot ${o.protection ?? ""}`.trim() : `swap w/ ${o.to ?? ""}`;
                    return chip(color, `’${y - 2000} ${label}`, o?.note ?? `${y} first-rounder — kept, clean`, `own${y}`);
                  })}
                </div>
                <div className="label mb-1 !text-[10px]">Incoming picks &amp; swap rights</div>
                <div className="mb-3 flex flex-wrap gap-1">
                  {(rights?.holdings ?? []).map((h, i) => {
                    const kindTxt = h.kind === "outright" ? `from ${h.origin ?? h.counterparties?.[0] ?? "?"}` : h.kind === "swap_right" ? `swap ${h.favorable ?? ""}`.trim() : "conditional";
                    const color = h.kind === "swap_right" ? "var(--tier-taxpayer)" : h.kind === "conditional" ? "var(--muted)" : "var(--tier-below_cap)";
                    return chip(color, `’${h.year - 2000} ${h.round === 1 ? "1st" : "2nd"} · ${kindTxt}`, h.note, `h${i}`);
                  })}
                  {!rights?.holdings.length && <span className="text-[10px] text-[var(--muted)]">None</span>}
                </div>
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-[var(--muted)]">Full ledger (RealGM) — {picks.incoming.length} in, {picks.outgoing.length} out</summary>
                  <div className="mt-1.5 max-h-[22vh] space-y-1 overflow-y-auto">
                    {picks.incoming.map((p, i) => (<div key={`in${i}`} className="text-[var(--muted)]"><span className="text-[var(--tier-below_cap)]">in</span> <span className="text-[var(--text)]">{p.year}</span> — {p.headline.replace(/^\d{4}\s+/i, "")}</div>))}
                    {picks.outgoing.map((p, i) => (<div key={`out${i}`} className="text-[var(--muted)]"><span className="text-[var(--tier-second_apron)]">out</span> <span className="text-[var(--text)]">{p.year}</span> — {p.headline.replace(/^\d{4}\s+/i, "")}</div>))}
                  </div>
                </details>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function salaryOf(c: { years: { leagueYear: string; salary: number }[] }): number {
  return c.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0;
}

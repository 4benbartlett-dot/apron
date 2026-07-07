"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { spendingPower } from "@apron/cba-engine";
import { DRAFT_PICKS } from "@apron/data";
import { C, TEAM_IDS, teamMeta, teamProjection } from "@/lib/league";
import { useLeague } from "@/lib/store";
import { fmtM, fmtFull } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { Thermometer } from "@/components/Thermometer";
import { DepthChart } from "@/components/DepthChart";
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
  const power = spendingPower(committed + holds, C);
  const roster = lg.roster(id);
  const picks = DRAFT_PICKS[id] ?? { incoming: [], outgoing: [] };
  const spaceAfterHolds = C.salaryCap - committed - holds;
  const proj = teamProjection(id, lg.contracts);

  const line = (n: number, hc: "first_apron" | "second_apron" | null) =>
    hc === "first_apron"
      ? Math.max(0, C.firstApron - committed)
      : hc === "second_apron"
        ? Math.max(0, C.secondApron - committed)
        : n;

  // "What can this team do" summary
  const canDo: string[] = [];
  if (spaceAfterHolds > 1_000_000)
    canDo.push(`~${fmtM(spaceAfterHolds)} in cap space (after renouncing/holding its own free agents).`);
  const topExc = power.mechanisms.find((m) => m.id !== "minimum" && m.id !== "cap_room");
  if (topExc)
    canDo.push(`Can sign an outside free agent up to ${fmtM(Math.min(topExc.maxSalary, line(topExc.maxSalary, topExc.hardCap)))} via the ${topExc.label}.`);
  if (sheet.isOverSecondApron)
    canDo.push("Hard-limited by the second apron: can't aggregate salaries, no mid-level, no cash out, and its 2033 first-rounder is frozen.");
  else if (sheet.isOverFirstApron)
    canDo.push("Over the first apron: capped at 100% salary matching and only the taxpayer MLE.");
  else
    canDo.push("Below the first apron: full expanded salary-matching and the non-taxpayer MLE are available.");
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
          <Link href={`/trade?a=${id}`} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--panel-2)]">Trade →</Link>
          <Link href="/free-agents" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--panel-2)]">Sign FAs →</Link>
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
            <a href="/standings" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text)]">Full standings</a> · current-roster snapshot, not a season forecast (no minutes model or injuries yet).
          </div>
        </div>
      )}

      <div className="panel mb-4 p-4">
        <div className="mb-2 text-sm font-semibold">Depth chart <span className="text-[var(--muted)]">· by position, deepest talent first</span></div>
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
          <div className="mb-1 text-xs font-semibold text-[var(--tier-below_cap)]">Incoming ({picks.incoming.length})</div>
          <div className="mb-3 max-h-[22vh] space-y-1 overflow-y-auto text-xs">
            {picks.incoming.map((p, i) => (
              <div key={i} className="text-[var(--muted)]"><span className="text-[var(--text)]">{p.year}</span> — {p.headline.replace(/^\d{4}\s+/i, "")}</div>
            ))}
            {!picks.incoming.length && <div className="text-[var(--muted)]">None</div>}
          </div>
          <div className="mb-1 text-xs font-semibold text-[var(--tier-second_apron)]">Outgoing ({picks.outgoing.length})</div>
          <div className="max-h-[22vh] space-y-1 overflow-y-auto text-xs">
            {picks.outgoing.map((p, i) => (
              <div key={i} className="text-[var(--muted)]"><span className="text-[var(--text)]">{p.year}</span> — {p.headline.replace(/^\d{4}\s+/i, "")}</div>
            ))}
            {!picks.outgoing.length && <div className="text-[var(--muted)]">None</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function salaryOf(c: { years: { leagueYear: string; salary: number }[] }): number {
  return c.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0;
}

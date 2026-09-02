"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { spendingPower } from "@apron/cba-engine";
import { DRAFT_PICKS, PICK_RIGHTS, type OwnFirstObligation } from "@apron/data";
import { C, TEAM_IDS, teamMeta, teamProjection, feedStateOf, consumedFor } from "@/lib/league";
import { useLeague } from "@/lib/store";
import { fmtM, fmtFull, hardCapCause } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { Thermometer } from "@/components/Thermometer";
import { DepthChart } from "@/components/DepthChart";
import { TeamProfile } from "@/components/TeamProfile";
import { ImpactPill, PosBadge } from "@/components/PlayerTags";
import { Tumbleweed } from "@/components/Tumbleweed";

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
    canDo.push(`~${fmtM(spaceAfterHolds)} in cap space, depending on which of its own free agents it keeps.`);
  const topExc = power.mechanisms.find((m) => m.id !== "minimum" && m.id !== "cap_room");
  // An exception a hard cap has squeezed to nothing is not an exception. A team
  // sitting on its own line still HOLDS its taxpayer mid-level, but offering a
  // free agent "up to $0.0M via the Taxpayer MLE" describes a signing nobody
  // can make. Below a rookie minimum there is no deal to be had, so say the
  // true thing instead.
  const topExcRoom = topExc
    ? Math.min(topExc.maxSalary, line(topExc.maxSalary, topExc.hardCap))
    : 0;
  if (topExc && topExcRoom >= C.minimumSalaries[0]!)
    canDo.push(`Can add an outside free agent up to ${fmtM(topExcRoom)} via the ${topExc.label}.`);
  else
    canDo.push("Minimum deals only for outside free agents — no cap room, and no exception left big enough to use.");

  // Why it's limited: what the audited July actually did.
  if (feed.roomTeam)
    canDo.push(`Operated under the cap this July${consumed.room_mle ? " (used its Room MLE)" : ""}, so the non-taxpayer MLE and bi-annual exception are dead for the season (Art. VII §6(n)).`);
  if (Number.isFinite(liveHardCap)) {
    // A cap tighter than the real-July feed means the user's own staged move
    // triggered it; attribute it so the "why" stays honest.
    const sessionTriggered = !Number.isFinite(feed.hardCap) || liveHardCap < feed.hardCap;
    const src = sessionTriggered ? "a move you've staged this session" : hardCapCause(feed.hardCapSource) ?? "";
    canDo.push(`Hard-capped at the ${liveHardCap === C.firstApron ? "first" : "second"} apron${src ? ` — triggered by ${src}` : ""}, so it can't cross that line the rest of the season.`);
    // A sheet already past its own hard cap is a state the CBA does not let
    // persist, so the page has to account for it or the number reads as a bug.
    // One line: how far over, why, and what clears it. The arithmetic and the
    // sourcing behind that line live in feed-team-state.json and stay there.
    const over = committed - liveHardCap;
    if (over > 0 && !sessionTriggered && feed.pendingRelief)
      canDo.push(
        `${fmtM(over)} over it today — the reported deal isn't filed yet. ${feed.pendingRelief.short}`,
      );
  }

  if (sheet.isOverSecondApron)
    canDo.push("Over the second apron: can't aggregate salaries, no mid-level, no cash out, and its future first-rounder can be frozen.");
  else if (sheet.isOverFirstApron)
    canDo.push("Over the first apron: capped at 100% salary matching in trades.");
  else if (!feed.roomTeam)
    canDo.push("Below the first apron: full expanded salary-matching is available.");
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  canDo.push(
    (() => {
      // A forfeited pick is not owed to anyone — it is gone. Count it apart.
      const forfeited = picks.outgoing.filter((p) => /forfeited to the league/i.test(p.headline)).length;
      const owed = picks.outgoing.length - forfeited;
      return `Draft capital: ${plural(picks.incoming.length, "extra incoming pick", "extra incoming picks")}, owes ${owed}${
        forfeited ? `, ${plural(forfeited, "pick forfeited to the league", "picks forfeited to the league")}` : ""
      }.`;
    })(),
  );

  return (
    <div>
      <div className="mb-5 flex items-center gap-4">
        <TeamLogo id={id} size={56} flourish />
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
        <div className="mb-2 text-sm font-semibold">What the {meta.name} can do this offseason</div>
        <ul className="space-y-1.5 text-sm">
          {canDo.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--tier-below_cap)]">›</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Thermometer salary={committed} holds={holds} c={C} />
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
            <a href="/standings" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text)]">Full standings</a> · models the position-aware rotation, a real-age aging curve, perimeter defense, and a bounded penalty for a structural hole; a talent-on-hand projection, not a full-season forecast (no coaching or playoff translation).
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
                <span className="flex min-w-0 items-center gap-1.5">
                  <ImpactPill c={c} />
                  <PosBadge playerId={c.playerId} />
                  <span className="truncate">{c.playerName}</span>
                  {c.restriction && <span className="shrink-0 text-[9px] font-bold text-[var(--tier-second_apron)]">NO-TRADE</span>}
                </span>
                <span className="tabular shrink-0 text-[var(--muted)]">{fmtM(salaryOf(c))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <div className="mb-2 text-sm font-semibold">Draft capital</div>
          {(() => {
            const rights = PICK_RIGHTS[id];
            // Layer the user's staged pick/swap trades on top of the real-world
            // ledger so draft capital tracks their moves. A pick id is
            // ORIGIN|YEAR|ROUND; a trade move records who sent it (`from`) and
            // where it lands (`to`). Moves made before from-tracking lack
            // `from`, so fall back to the origin heuristic for those.
            const sessionPicks = lg.moves.flatMap((m) => (m.kind === "trade" ? m.picks ?? [] : []));
            const sessionSwaps = lg.moves.flatMap((m) => (m.kind === "trade" ? m.pickSwaps ?? [] : []));
            const parsed = sessionPicks.map((p) => {
              const [origin, yr, rd] = p.id.split("|");
              return {
                id: p.id,
                to: p.to,
                origin: origin ?? "?",
                year: Number(yr),
                round: rd === "1" ? 1 : 2,
                sentByTeam: p.from !== undefined ? p.from === id : origin === id && p.to !== id,
                receivedByTeam: p.to === id,
              };
            });
            const sentOwnFirst = new Map<number, string>(); // own 1st traded out → new owner
            const reTraded = new Set<string>(); // "YEAR|ROUND|ORIGIN" of a held pick sent away
            for (const p of parsed) {
              if (p.sentByTeam && p.origin === id && p.round === 1) sentOwnFirst.set(p.year, p.to);
              else if (p.sentByTeam && p.origin !== id) reTraded.add(`${p.year}|${p.round}|${p.origin}`);
            }
            const sentIds = new Set(parsed.filter((p) => p.sentByTeam).map((p) => p.id));
            // Picks acquired (another team's pick, received and not later re-sent).
            const acquired = parsed.filter((p) => p.receivedByTeam && p.origin !== id && !sentIds.has(p.id));
            // Real-world incoming holdings the team re-traded away this session.
            const visibleHoldings = (rights?.holdings ?? []).filter(
              (h) => !h.overlapsPrior && !reTraded.has(`${h.year}|${h.round}|${h.origin ?? ""}`),
            );
            const swapsForTeam = sessionSwaps.filter((s) => s.favoredTo === id || s.otherTeam === id);
            // Group obligations by year — a team can have >1 leg on the same
            // year (e.g. PHI 2028 is both owed-to-BOS and protected-to-BKN), and
            // a Map keyed by year would silently drop all but the last.
            const oblByYear = new Map<number, OwnFirstObligation[]>();
            for (const o of rights?.ownFirstObligations ?? []) {
              const arr = oblByYear.get(o.year);
              if (arr) arr.push(o);
              else oblByYear.set(o.year, [o]);
            }
            // Range is data-driven so obligations past 2032 (real 2033 owes
            // exist) always render; falls back to the 2027–2032 window.
            const maxOwnYear = Math.max(2032, ...(rights?.ownFirstObligations ?? []).map((o) => o.year));
            const ownYears = Array.from({ length: maxOwnYear - 2027 + 1 }, (_, i) => 2027 + i);
            const chip = (color: string, text: string, title: string, key: string) => (
              <span key={key} title={title} className="tabular rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium"
                style={{ borderColor: color, color, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>{text}</span>
            );
            const oblChip = (y: number, o: OwnFirstObligation, key: string) => {
              // A forfeiture reads like an owe — the pick is gone — but with no
              // counterparty: the league took it, and nobody sends it back.
              const color = o.status === "owed" || o.status === "forfeited" ? "var(--tier-second_apron)" : "var(--tier-taxpayer)";
              const label =
                o.status === "forfeited" ? "forfeited" : o.status === "owed" ? `→ ${o.to ?? ""}` : o.status === "protected" ? `prot ${o.protection ?? ""}`.trim() : `swap w/ ${o.to ?? ""}`;
              return chip(color, `’${y - 2000} ${label}`, o.note ?? `${y} first-rounder`, key);
            };
            // PHX easter egg: when nearly every own first is encumbered or
            // already out the door, a tumbleweed rolls through the shelf.
            const bareYears = ownYears.filter(
              (y) => (oblByYear.get(y) ?? []).length > 0 || sentOwnFirst.has(y),
            ).length;
            return (
              <>
                <div className="label mb-1 !text-[10px]">Own first-rounders</div>
                <div className="relative mb-3 flex flex-wrap gap-1">
                  {id === "PHX" && bareYears >= 3 && <Tumbleweed />}
                  {ownYears.flatMap((y) => {
                    const legs = oblByYear.get(y) ?? [];
                    const chips = legs.map((o, j) => oblChip(y, o, `own${y}-${j}`));
                    const sent = sentOwnFirst.get(y);
                    if (sent)
                      chips.push(chip("var(--tier-second_apron)", `’${y - 2000} → ${sent}`, `${y} first-rounder — traded to ${sent} in your staged moves`, `own${y}-sess`));
                    if (!chips.length)
                      return [chip("var(--tier-below_cap)", `’${y - 2000} kept`, `${y} first-rounder — kept, clean`, `own${y}`)];
                    return chips;
                  })}
                </div>
                <div className="label mb-1 !text-[10px]">Incoming picks &amp; swap rights</div>
                <div className="mb-3 flex flex-wrap gap-1">
                  {visibleHoldings.map((h, i) => {
                    const kindTxt = h.kind === "outright" ? `from ${h.origin ?? h.counterparties?.[0] ?? "?"}` : h.kind === "swap_right" ? `swap ${h.favorable ?? ""}`.trim() : "conditional";
                    // An acquired pick the league then took (the Clippers' Indiana
                    // 2029): shown, struck, so the ledger says where it went
                    // rather than quietly losing a row.
                    if (h.forfeited)
                      return (
                        <span key={`h${i}`} title={h.note} className="tabular rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ borderColor: "var(--tier-second_apron)", color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 8%, transparent)" }}>
                          <span className="line-through decoration-[1.5px]">{`’${h.year - 2000} ${h.round === 1 ? "1st" : "2nd"} · ${kindTxt}`}</span> · forfeited
                        </span>
                      );
                    const color = h.kind === "swap_right" ? "var(--tier-taxpayer)" : h.kind === "conditional" ? "var(--muted)" : "var(--tier-below_cap)";
                    return chip(color, `’${h.year - 2000} ${h.round === 1 ? "1st" : "2nd"} · ${kindTxt}`, h.note, `h${i}`);
                  })}
                  {acquired.map((p, i) =>
                    chip("var(--tier-below_cap)", `’${p.year - 2000} ${p.round === 1 ? "1st" : "2nd"} · from ${p.origin}`, `Acquired from ${p.origin} in your staged moves`, `sess-in${i}`),
                  )}
                  {swapsForTeam.map((s, i) =>
                    chip("var(--tier-taxpayer)", `’${s.year - 2000} ${s.round === 1 ? "1st" : "2nd"} swap w/ ${s.favoredTo === id ? s.otherTeam : s.favoredTo}`, `Swap right from your staged moves (${s.favoredTo === id ? "you take the more favorable pick" : "counterparty takes the more favorable pick"})`, `sess-swap${i}`),
                  )}
                  {!visibleHoldings.length && !acquired.length && !swapsForTeam.length && <span className="text-[10px] text-[var(--muted)]">None</span>}
                </div>
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-[var(--muted)]">Full ledger — {picks.incoming.length} in, {picks.outgoing.length} out</summary>
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

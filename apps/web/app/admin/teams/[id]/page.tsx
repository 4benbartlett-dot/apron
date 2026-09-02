import Link from "next/link";
import { notFound } from "next/navigation";
import { capSheet as engCapSheet, spendingPower } from "@apron/cba-engine";
import { PICK_RIGHTS, forfeituresOf } from "@apron/data";
import {
  BASE_CONTRACTS,
  C,
  YEAR,
  CAP_SHEET_YEARS,
  TEAM_IDS,
  leagueData,
  rosterOf,
  deadMoneyOf,
  freeAgentsOf,
  holdsByTeam,
  feedStateOf,
  consumedFor,
  tpeLedger,
  teamMeta,
  currentSalary,
  teamProjection,
} from "@/lib/league";
import { fmtM, fmtFull, hardCapCause } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { Thermometer } from "@/components/Thermometer";
import { provenanceOf } from "@/lib/admin/provenance";
import { tradeablePicks } from "@/lib/admin/picks";

const GUARANTEE_GLYPH: Record<string, string> = {
  full: "",
  partial: "P",
  non_guaranteed: "NG",
  team_option: "TO",
  player_option: "PO",
};

const SOURCE_TAG: Record<string, { text: string; color: string }> = {
  contracts: { text: "sheet", color: "var(--muted)" },
  extraContracts: { text: "stub", color: "var(--tier-over_cap)" },
  rookies: { text: "rookie", color: "var(--tier-taxpayer)" },
};

/** One team's books, as the site computes them, with the way into every edit. */
export default async function AdminTeam({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = raw.toUpperCase();
  if (!TEAM_IDS.includes(id)) notFound();
  const data = leagueData(BASE_CONTRACTS);
  const sheet = engCapSheet(data, id, C);
  const fas = freeAgentsOf(BASE_CONTRACTS).filter((f) => f.priorTeam === id);
  const feed = feedStateOf(id);
  const holds = fas.filter((f) => !feed.forcedRenounced.has(f.playerName.toLowerCase())).reduce((s, f) => s + f.hold, 0);
  const roster = rosterOf(BASE_CONTRACTS, id);
  const dead = deadMoneyOf(BASE_CONTRACTS, id);
  const twoWays = BASE_CONTRACTS.filter((c) => c.teamId === id && (c.twoWay || c.signedUsing === "Two-Way") && currentSalary(c) === 0);
  const consumed = consumedFor([], id);
  const power = spendingPower(sheet.salary + holds, C, { apronSalary: sheet.salary, roomTeam: feed.roomTeam, consumed });
  const tpes = tpeLedger([])[id] ?? [];
  const rights = PICK_RIGHTS[id] ?? { ownFirstObligations: [], holdings: [] };
  const forfeits = forfeituresOf(id);
  const proj = teamProjection(id, BASE_CONTRACTS);
  const byYear = (c: (typeof roster)[number], y: string) => c.years.find((yr) => yr.leagueYear === y);
  const totals = CAP_SHEET_YEARS.map((y) => BASE_CONTRACTS.filter((c) => c.teamId === id).reduce((s, c) => s + (byYear(c, y)?.salary ?? 0), 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <TeamLogo id={id} size={44} />
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{teamMeta(id).name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted)]">
            <TierBadge tier={sheet.tier} />
            <span className="tabular">
              {fmtFull(sheet.salary)} committed · {fmtM(holds)} in holds · {sheet.capRoom >= 0 ? `${fmtM(sheet.capRoom)} of room` : `${fmtM(-sheet.capRoom)} over the cap`}
            </span>
            {proj && <span className="tabular">· projects {proj.projWins}-{82 - proj.projWins}</span>}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/admin/desk?tab=sign&team=${id}`} className="admin-btn">Sign a free agent</Link>
          <Link href={`/admin/desk?tab=trade&team=${id}`} className="admin-btn">Trade</Link>
          <Link href={`/admin/desk?tab=waive&team=${id}`} className="admin-btn">Waive</Link>
          <Link href={`/team/${id}`} className="admin-btn" target="_blank">Public page ↗</Link>
        </div>
      </div>

      <div className="panel p-4">
        <Thermometer salary={sheet.salary} c={C} holds={holds} />
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <div>
            <div className="label !text-[10px]">Hard cap</div>
            <div className="mt-0.5 font-semibold">
              {Number.isFinite(feed.hardCap) ? (
                <span style={{ color: feed.hardCap === C.firstApron ? "var(--tier-first_apron)" : "var(--tier-second_apron)" }}>
                  {fmtM(feed.hardCap)} · {hardCapCause(feed.hardCapSource)}
                </span>
              ) : (
                <span className="text-[var(--muted)]">none this season</span>
              )}
            </div>
          </div>
          <div>
            <div className="label !text-[10px]">Exceptions left</div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {power.mechanisms
                .filter((m) => m.id !== "cap_room" && m.id !== "bird")
                .map((m) => (
                  <span key={m.id} className="tabular rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px]">
                    {m.label} {fmtM(m.maxSalary)}
                  </span>
                ))}
              {feed.roomTeam && <span className="text-[11px] text-[var(--muted)]">room team: MLE/BAE dead (§6(n))</span>}
            </div>
          </div>
          <div>
            <div className="label !text-[10px]">Traded-player exceptions</div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {tpes.length ? tpes.map((t) => (
                <span key={t.label} className="tabular rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px]" title={`expires ${t.expires}${t.firstApronCap ? " · row F (first-apron cap on use)" : ""}`}>
                  {t.label} {fmtM(t.amount)}
                </span>
              )) : <span className="text-[11px] text-[var(--muted)]">none</span>}
            </div>
          </div>
          <div>
            <div className="label !text-[10px]">Offseason state</div>
            <div className="mt-0.5 text-[11.5px]">
              {Object.keys(consumed).length
                ? Object.entries(consumed).map(([k, v]) => `${k} ${fmtM(v ?? 0)}`).join(" · ")
                : "no exception spent"}
              {" · "}
              <Link href="/admin/files/feedTeamState" className="underline decoration-dotted underline-offset-2">edit</Link>
            </div>
          </div>
        </div>
      </div>

      {/* roster */}
      <section className="panel overflow-x-auto">
        <table className="admin-table min-w-[52rem]">
          <thead>
            <tr>
              <th>Player</th>
              {CAP_SHEET_YEARS.map((y) => (
                <th key={y} className="text-right">{y}</th>
              ))}
              <th>Flags</th>
              <th>Row</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roster.map((c) => {
              const p = provenanceOf(c);
              const tag = p.source ? SOURCE_TAG[p.source.id] : { text: "derived", color: "var(--muted)" };
              return (
                <tr key={c.playerId}>
                  <td>
                    <Link href={`/admin/contracts/${encodeURIComponent(c.playerId)}`} className="font-semibold hover:text-[var(--accent-ink)]">
                      {c.playerName}
                    </Link>
                  </td>
                  {CAP_SHEET_YEARS.map((y) => {
                    const yr = byYear(c, y);
                    const g = yr ? GUARANTEE_GLYPH[yr.guarantee] : "";
                    return (
                      <td key={y} className="tabular text-right">
                        {yr && yr.salary > 0 ? fmtFull(yr.salary) : <span className="text-[var(--muted)]">—</span>}
                        {g && <span className="ml-1 text-[9px] font-bold text-[var(--tier-taxpayer)]">{g}</span>}
                      </td>
                    );
                  })}
                  <td className="text-[10.5px] text-[var(--muted)]">
                    {c.restriction && <span className="mr-1 font-bold text-[var(--tier-second_apron)]">NO-TRADE</span>}
                    {c.noAggregate && <span className="mr-1">no-agg</span>}
                    {c.tradeKickerPct ? <span className="mr-1">kicker {Math.round(c.tradeKickerPct * 100)}%</span> : null}
                    {c.bycPriorSalary ? <span className="mr-1">BYC</span> : null}
                    {p.currentYearGoverned !== "base" && p.currentYearGoverned !== "rookie" && (
                      <span className="mr-1 rounded bg-[var(--panel-2)] px-1">{p.currentYearGoverned}</span>
                    )}
                  </td>
                  <td>
                    <span className="admin-tag" style={{ color: tag?.color, background: `color-mix(in srgb, ${tag?.color} 12%, transparent)` }}>
                      {tag?.text}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[11px]">
                    <Link href={`/admin/contracts/${encodeURIComponent(c.playerId)}`} className="text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">edit</Link>
                    {" · "}
                    <Link href={`/admin/desk?tab=waive&team=${id}&player=${encodeURIComponent(c.playerId)}`} className="text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">waive</Link>
                    {" · "}
                    <Link href={`/admin/desk?tab=extend&team=${id}&player=${encodeURIComponent(c.playerId)}`} className="text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">extend</Link>
                  </td>
                </tr>
              );
            })}
            {dead.map((c) => (
              <tr key={c.playerId} className="text-[var(--muted)]">
                <td>
                  <Link href={`/admin/contracts/${encodeURIComponent(c.playerId)}`} className="hover:text-[var(--accent-ink)]">{c.playerName}</Link>
                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide">dead money</span>
                </td>
                {CAP_SHEET_YEARS.map((y) => {
                  const yr = byYear(c, y);
                  return (
                    <td key={y} className="tabular text-right">{yr && yr.salary > 0 ? fmtFull(yr.salary) : "—"}</td>
                  );
                })}
                <td className="text-[10.5px]">{c.years.length > 1 && new Set(c.years.map((y) => y.salary)).size === 1 ? "stretched" : ""}</td>
                <td colSpan={2} />
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="total-rule">Team salary · {roster.length} on the sheet{twoWays.length ? `, ${twoWays.length} two-way` : ""}</td>
              {totals.map((t, i) => (
                <td key={i} className="tabular total-rule text-right">{fmtFull(t)}</td>
              ))}
              <td colSpan={3} className="total-rule" />
            </tr>
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-[var(--muted)]">
          P partial · NG non-guaranteed · TO team option · PO player option. The Row column says which file holds the raw line; a Flags chip like <em>signed-feed</em> or <em>stated</em> means a feed pass rebuilt the 2026-27 number, so the contract editor explains what governs it.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* free agents */}
        <section className="panel p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[13.5px] font-bold">Free agents &amp; holds</h3>
            <span className="label">{fmtM(holds)} on the books</span>
          </div>
          {fas.length ? (
            <table className="admin-table">
              <thead>
                <tr><th>Player</th><th>Rights</th><th className="text-right">2025-26</th><th className="text-right">Hold</th><th></th></tr>
              </thead>
              <tbody>
                {fas.map((f) => {
                  const forced = feed.forcedRenounced.has(f.playerName.toLowerCase());
                  return (
                    <tr key={f.playerId} className={forced ? "text-[var(--muted)] line-through" : ""}>
                      <td>{f.playerName}{f.faType ? <span className="ml-1 text-[10px] text-[var(--muted)]">{f.faType}</span> : null}</td>
                      <td className="text-[11px]">{f.birdStatus.replace("_", "-")}{forced ? " · renounced (feed)" : ""}</td>
                      <td className="tabular text-right">{fmtM(f.lastSalary)}</td>
                      <td className="tabular text-right">{fmtM(f.hold)}</td>
                      <td className="text-[11px]">
                        <Link href={`/admin/desk?tab=sign&team=${id}&player=${encodeURIComponent(f.playerId)}`} className="text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">re-sign</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-[var(--muted)]">No free-agent holds.</p>
          )}
        </section>

        {/* picks */}
        <section className="panel p-4">
          <h3 className="mb-2 text-[13.5px] font-bold">Draft picks</h3>
          <div className="label mb-1 !text-[10px]">Own first-rounders</div>
          <div className="mb-3 flex flex-wrap gap-1">
            {[2027, 2028, 2029, 2030, 2031, 2032, 2033].map((y) => {
              const legs = rights.ownFirstObligations.filter((o) => o.year === y);
              if (!legs.length) return <Chip key={y} color="var(--tier-below_cap)" text={`’${y - 2000} kept`} title="own first, clean" />;
              return legs.map((o, j) => (
                <Chip
                  key={`${y}-${j}`}
                  color={o.status === "swap" || o.status === "protected" ? "var(--tier-taxpayer)" : "var(--tier-second_apron)"}
                  text={`’${y - 2000} ${o.status === "forfeited" ? "forfeited" : o.status === "owed" ? `→ ${o.to}` : o.status === "protected" ? `prot ${o.protection ?? ""}` : `swap w/ ${o.to}`}`}
                  title={o.note}
                />
              ));
            })}
          </div>
          <div className="label mb-1 !text-[10px]">Holdings &amp; swap rights</div>
          <div className="mb-3 flex flex-wrap gap-1">
            {rights.holdings.filter((h) => !h.overlapsPrior).map((h, i) => (
              <Chip
                key={i}
                color={h.forfeited ? "var(--tier-second_apron)" : h.kind === "outright" ? "var(--tier-below_cap)" : h.kind === "swap_right" ? "var(--tier-taxpayer)" : "var(--muted)"}
                text={`’${h.year - 2000} ${h.round === 1 ? "1st" : "2nd"} · ${h.kind === "outright" ? `from ${h.origin}` : h.kind === "swap_right" ? `swap ${h.favorable ?? ""}` : "conditional"}${h.forfeited ? " · forfeited" : ""}`}
                title={h.note}
                strike={!!h.forfeited}
              />
            ))}
            {!rights.holdings.length && <span className="text-[11px] text-[var(--muted)]">none</span>}
          </div>
          {forfeits.length > 0 && (
            <p className="mb-2 text-[11.5px] text-[var(--tier-second_apron)]">
              {forfeits.length} pick{forfeits.length === 1 ? "" : "s"} forfeited to the league ({forfeits.map((f) => f.year).join(", ")}) — from league-rulings.json.
            </p>
          )}
          <div className="label mb-1 !text-[10px]">Tradeable today (2027–2032)</div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            {tradeablePicks(PICK_RIGHTS, id, [2027, 2028, 2029, 2030, 2031, 2032]).map((p) => (
              <span key={p.id} className="tabular rounded border border-[var(--border)] px-1.5 py-0.5">{p.label}</span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Edit the structured ledger in <Link href="/admin/files/pickRights" className="underline decoration-dotted underline-offset-2">pick-rights-2026.json</Link>; trades filed from the desk move picks there automatically.
          </p>
        </section>
      </div>

      {feed.hardCapSource || Object.keys(consumed).length || feed.roomTeam ? (
        <details className="panel p-4 text-[12px]">
          <summary className="cursor-pointer text-[13px] font-bold">Feed-state rationale</summary>
          <p className="mt-2 leading-relaxed text-[var(--text)]/85">{rationaleOf(id)}</p>
        </details>
      ) : null}
    </div>
  );
}

function Chip({ color, text, title, strike }: { color: string; text: string; title: string; strike?: boolean }) {
  return (
    <span title={title} className="tabular rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: color, color, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
      <span className={strike ? "line-through" : ""}>{text}</span>
    </span>
  );
}

import { FEED_TEAM_STATE } from "@apron/data";
const rationaleOf = (id: string) => FEED_TEAM_STATE[id]?.rationale ?? "No rationale recorded for this team.";

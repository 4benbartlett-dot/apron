import Link from "next/link";
import { capSheet as engCapSheet } from "@apron/cba-engine";
import { DATA_AS_OF, LEAGUE_RULINGS, TRANSACTIONS } from "@apron/data";
import ext from "../../../../packages/data/src/external-cap-check.json";
import { BASE_CONTRACTS, C, TEAMS, leagueData, rosterOf, deadMoneyOf, freeAgentsOf, holdsByTeam, feedStateOf, teamNickname, byNickname, currentSalary } from "@/lib/league";
import { fmtM, hardCapCause } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { validateAll } from "@/lib/admin/files";
import { dataStatus } from "@/lib/admin/git";

/**
 * The overview: the league as the site currently computes it, and the health
 * of the data behind it. Every number here is the reconciled 2026-27 sheet —
 * base contracts plus the feeds — so it is exactly what a visitor sees.
 */
export default async function AdminHome() {
  const [validation, dirty] = await Promise.all([validateAll(), dataStatus().catch(() => [])]);
  const issues = validation.filter((v) => v.issues.length);
  const data = leagueData(BASE_CONTRACTS);
  const holds = holdsByTeam(
    freeAgentsOf(BASE_CONTRACTS).filter((f) => !feedStateOf(f.priorTeam).forcedRenounced.has(f.playerName.toLowerCase())),
  );
  const rows = TEAMS.map((t) => {
    const sheet = engCapSheet(data, t.id, C);
    const feed = feedStateOf(t.id);
    const dead = deadMoneyOf(BASE_CONTRACTS, t.id).reduce((s, c) => s + currentSalary(c), 0);
    const theirs = (ext.byTeam as Record<string, { apronSalary: number }>)[t.id]?.apronSalary;
    return { id: t.id, sheet, feed, dead, roster: rosterOf(BASE_CONTRACTS, t.id).length, holds: holds[t.id] ?? 0, theirs };
  }).sort((a, b) => b.sheet.salary - a.sheet.salary);
  const newestFeed = TRANSACTIONS[0];
  const dirtyPaths = new Set(dirty.map((d) => d.path.split("/").pop()));

  return (
    <div className="space-y-6">
      {/* health */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Rosters as of" value={DATA_AS_OF} sub={newestFeed ? `newest feed row ${newestFeed.date}` : ""} />
        <Stat label="Spotrac apron tracker" value={(ext as { asOf: string }).asOf} sub="external check, 30 teams" />
        <Stat
          label="Schema"
          value={issues.length ? `${issues.length} file${issues.length === 1 ? "" : "s"} with issues` : "every file valid"}
          tone={issues.length ? "var(--tier-second_apron)" : "var(--tier-below_cap)"}
          sub={`${validation.length} files checked`}
          href="/admin/files"
        />
        <Stat
          label="Uncommitted"
          value={dirty.length ? `${dirty.length} data file${dirty.length === 1 ? "" : "s"}` : "clean"}
          tone={dirty.length ? "var(--accent-ink)" : undefined}
          sub={dirty.length ? dirty.map((d) => d.path.split("/").pop()).join(", ") : "packages/data/src matches HEAD"}
          href="/admin/review"
        />
      </section>

      {issues.length > 0 && (
        <section className="panel border-[var(--tier-second_apron)]/50 p-4">
          <div className="label mb-2 !text-[var(--tier-second_apron)]">Schema issues</div>
          <ul className="space-y-1 text-[12.5px]">
            {issues.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/files/${v.id}`} className="font-semibold underline decoration-dotted underline-offset-2">
                  {v.file}
                </Link>{" "}
                <span className="text-[var(--muted)]">
                  {v.issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join(" · ")}
                  {v.issues.length > 3 ? ` · +${v.issues.length - 3} more` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {LEAGUE_RULINGS.length > 0 && (
        <section className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--muted)]">
          <span className="label">League rulings on file</span>
          {LEAGUE_RULINGS.map((r) => (
            <span key={r.id}>
              <span className="tabular">{r.date}</span> · {r.headline}
            </span>
          ))}
          <Link href="/admin/files/leagueRulings" className="underline decoration-dotted underline-offset-2">
            edit
          </Link>
        </section>
      )}

      {/* the league */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold tracking-tight">All 30 teams, 2026-27</h2>
          <span className="label">committed salary · holds excluded from the tier</span>
        </div>
        <div className="panel overflow-x-auto">
          <table className="admin-table min-w-[64rem]">
            <thead>
              <tr>
                <th>Team</th>
                <th>Tier</th>
                <th className="text-right">Committed</th>
                <th className="text-right">Holds</th>
                <th className="text-right">Cap room</th>
                <th className="text-right">To 1st apron</th>
                <th>Hard cap</th>
                <th className="text-right">Dead</th>
                <th className="text-right">Roster</th>
                <th className="text-right">vs Spotrac</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const gap = r.theirs != null ? r.sheet.salary - r.theirs : null;
                return (
                  <tr key={r.id} className={dirtyPaths.size && false ? "" : ""}>
                    <td>
                      <Link href={`/admin/teams/${r.id}`} className="flex items-center gap-2 font-semibold hover:text-[var(--accent-ink)]">
                        <TeamLogo id={r.id} size={18} />
                        {teamNickname(r.id)}
                        <span className="tabular text-[10px] font-normal text-[var(--muted)]">{r.id}</span>
                      </Link>
                    </td>
                    <td>
                      <TierBadge tier={r.sheet.tier} />
                    </td>
                    <td className="tabular text-right font-semibold">{fmtM(r.sheet.salary)}</td>
                    <td className="tabular text-right text-[var(--muted)]">{r.holds ? fmtM(r.holds) : "—"}</td>
                    <td className="tabular text-right" style={{ color: r.sheet.capRoom >= 0 ? "var(--tier-below_cap)" : "var(--muted)" }}>
                      {r.sheet.capRoom >= 0 ? `+${fmtM(r.sheet.capRoom)}` : fmtM(r.sheet.capRoom)}
                    </td>
                    <td className="tabular text-right">{fmtM(r.sheet.spaceBelowFirstApron)}</td>
                    <td className="text-[11.5px]">
                      {Number.isFinite(r.feed.hardCap) ? (
                        <span style={{ color: r.feed.hardCap === C.firstApron ? "var(--tier-first_apron)" : "var(--tier-second_apron)" }}>
                          {r.feed.hardCap === C.firstApron ? "1A" : "2A"}
                          <span className="text-[var(--muted)]"> · {hardCapCause(r.feed.hardCapSource)}</span>
                        </span>
                      ) : r.feed.roomTeam ? (
                        <span className="text-[var(--muted)]">room team</span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="tabular text-right text-[var(--muted)]">{r.dead ? fmtM(r.dead) : "—"}</td>
                    <td className="tabular text-right">{r.roster}</td>
                    <td className="tabular text-right" style={{ color: gap != null && Math.abs(gap) > 5_000_000 ? "var(--tier-taxpayer)" : "var(--muted)" }}>
                      {gap == null ? "—" : `${gap >= 0 ? "+" : ""}${fmtM(gap)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Sorted by committed 2026-27 salary. Cap {fmtM(C.salaryCap)} · tax {fmtM(C.luxuryTaxLine)} · first apron {fmtM(C.firstApron)} · second apron {fmtM(C.secondApron)}. The Spotrac column is the gap against their apron tracker; a gap over $5M is worth a look, and the explained ones are listed in externalCapCheck.test.ts.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickLink href="/admin/desk" title="Desk" text="File a trade, signing, waive, option or extension. The engine rules on it first; the filing is a feed-shaped row in manual-moves.json." />
        <QuickLink href="/admin/ledger" title="Ledger" text="The curated moves and feed corrections, editable row by row, next to the scraped feed." />
        <QuickLink href="/admin/review" title="Review & commit" text="What changed under packages/data, the checks that guard it, and a commit." />
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: string; href?: string }) {
  const body = (
    <>
      <div className="label !text-[10px]">{label}</div>
      <div className="tabular mt-1 text-[15px] font-bold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]" title={sub}>{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="panel block p-3 hover:border-[var(--accent)]">
      {body}
    </Link>
  ) : (
    <div className="panel p-3">{body}</div>
  );
}

function QuickLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="panel block p-4 hover:border-[var(--accent)]">
      <div className="text-[13.5px] font-bold">{title} →</div>
      <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{text}</p>
    </Link>
  );
}

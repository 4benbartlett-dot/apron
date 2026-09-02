"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "@apron/data";
import { PICK_RIGHTS } from "@apron/data";
import type { MechanismId } from "@apron/cba-engine";
import { BASE_CONTRACTS, TEAM_IDS, teamMeta, teamNickname, byNickname, rosterOf, freeAgentsOf, currentSalary, positionOf, YEAR } from "@/lib/league";
import { fmtM, fmtFull } from "@/lib/format";
import { TradeDocket } from "@/components/TradeDocket";
import { SEV_COLOR } from "@/lib/docket";
import { TeamLogo } from "@/components/TeamLogo";
import { ruleTrade, ruleSigning, ruleWaive } from "@/lib/admin/rule";
import { tradeablePicks } from "@/lib/admin/picks";
import { tradeRows, signingRow, waiveRow, optionRow, extensionRow, MECHANISM_TEXT } from "@/lib/admin/prose";
import { provenanceOf } from "@/lib/admin/provenance";
import { fileTrade, fileSigning, fileWaive, fileOption, fileExtension, type ActionResult } from "@/app/admin/actions";
import { Field, Status } from "@/components/admin/ContractEditor";

const TABS = [
  { id: "trade", label: "Trade" },
  { id: "sign", label: "Sign" },
  { id: "waive", label: "Waive / stretch" },
  { id: "option", label: "Option" },
  { id: "extend", label: "Extend" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const PICK_YEARS = [2027, 2028, 2029, 2030, 2031, 2032] as const;
const TEAMS_SORTED = [...TEAM_IDS].sort(byNickname);

/** The feed prints the city then the code — the same namer the actions use. */
const city = (code: string) => {
  const name = teamMeta(code).name;
  const nick = teamNickname(code);
  return name.endsWith(nick) ? name.slice(0, -nick.length).trim() || name : name;
};
const posOf = (playerId: string) => positionOf(playerId) ?? "—";

/**
 * The desk. Every tab is the same shape: describe the move, watch the engine
 * rule on it as you type, then file it — as feed-shaped rows in
 * manual-moves.json (and, for picks, the pick-rights ledger), which is how the
 * rest of the site already ingests the real world. The rows to be written are
 * shown verbatim before the button is pressed.
 */
export function Desk({ initial, asOf }: { initial: { tab?: string; team?: string; player?: string }; asOf: string }) {
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t.id === initial.tab)?.id ?? "trade") as Tab);
  const team = initial.team && TEAM_IDS.includes(initial.team.toUpperCase()) ? initial.team.toUpperCase() : "BOS";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-[13px] ${tab === t.id ? "bg-[var(--text)] font-semibold text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-[var(--muted)]">Rulings run over the feed-reconciled sheet, not anyone's browser session.</span>
      </div>
      {tab === "trade" && <TradeTab initialTeam={team} asOf={asOf} />}
      {tab === "sign" && <SignTab initialTeam={team} initialPlayer={initial.player} asOf={asOf} />}
      {tab === "waive" && <WaiveTab initialTeam={team} initialPlayer={initial.player} asOf={asOf} />}
      {tab === "option" && <OptionTab initialTeam={team} initialPlayer={initial.player} asOf={asOf} />}
      {tab === "extend" && <ExtendTab initialTeam={team} initialPlayer={initial.player} asOf={asOf} />}
    </div>
  );
}

/* --------------------------------- shared --------------------------------- */

function TeamSelect({ value, onChange, exclude = [] }: { value: string; onChange: (t: string) => void; exclude?: string[] }) {
  return (
    <select className="admin-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {TEAMS_SORTED.filter((t) => t === value || !exclude.includes(t)).map((t) => (
        <option key={t} value={t}>{teamMeta(t).name}</option>
      ))}
    </select>
  );
}

function Filing({
  date,
  setDate,
  why,
  setWhy,
  asOf,
  rows,
  disabled,
  pending,
  onFile,
  result,
  extra,
}: {
  date: string;
  setDate: (d: string) => void;
  why: string;
  setWhy: (w: string) => void;
  asOf: string;
  rows: Transaction[];
  disabled: boolean;
  pending: boolean;
  onFile: () => void;
  result: ActionResult<unknown> | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13.5px] font-bold">File it</h3>
        <span className="label">writes manual-moves.json</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Date">
          <input className="admin-input tabular" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {date > asOf && <div className="mt-1 text-[10.5px] text-[var(--tier-taxpayer)]">After the roster snapshot ({asOf}); bump meta.json too or the news guard will object.</div>}
        </Field>
        <Field label="Why — the source and the arithmetic (kept on the row)">
          <input className="admin-input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Shams, Sep 3: 2yr/$16M; year one back-solves to $7.8M at 5% raises" />
        </Field>
      </div>
      {extra}
      {rows.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--panel-2)]/50 p-2.5">
          <div className="label mb-1 !text-[10px]">Rows as they will be written</div>
          {rows.map((r, i) => (
            <div key={i} className="admin-mono py-0.5 text-[11px] leading-snug">
              <span className="text-[var(--muted)]">{r.date} · {r.type} · </span>
              <span className="font-semibold">{r.player}</span> <span className="text-[var(--muted)]">({r.pos})</span> — {r.detail}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="admin-btn admin-btn-primary" disabled={disabled || pending || why.trim().length < 8} onClick={onFile}>
          {pending ? "Filing…" : "File it"}
        </button>
        {why.trim().length < 8 && <span className="text-[11px] text-[var(--muted)]">a why is required</span>}
        {result && <Status r={result} />}
      </div>
    </div>
  );
}

function Receipt({ checks, consequences, legal, stamp }: { checks: { ok: boolean; text: string }[]; consequences: { severity: "cap" | "restrict" | "note"; text: string }[]; legal: boolean; stamp?: string }) {
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13.5px] font-bold">{legal ? "Why it works" : "What's in the way"}</h3>
        <span className="stamp text-[12px]" style={{ color: legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
          {stamp ?? (legal ? "Legal" : "Blocked")}
        </span>
      </div>
      <ul className="space-y-1.5">
        {checks.map((c, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
            <span className="shrink-0 font-bold" style={{ color: c.ok ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>{c.ok ? "✓" : "✗"}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      {consequences.length > 0 && (
        <>
          <div className="label mb-1 mt-3 !text-[10px]">What it turns on</div>
          <ul className="space-y-1">
            {consequences.map((c, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug">
                <span className="shrink-0 font-bold" style={{ color: SEV_COLOR[c.severity] }}>▸</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const useFiler = () => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        await new Promise((res) => setTimeout(res, 900));
        router.refresh();
      }
    });
  return { pending, result, run };
};

/* --------------------------------- trade ---------------------------------- */

function TradeTab({ initialTeam, asOf }: { initialTeam: string; asOf: string }) {
  const [teams, setTeams] = useState<string[]>([initialTeam, initialTeam === "LAL" ? "BOS" : "LAL"]);
  const [dest, setDest] = useState<Record<string, string>>({});
  const [pickDest, setPickDest] = useState<Record<string, { from: string; to: string; protection: string }>>({});
  const [cash, setCash] = useState<Record<string, { to: string; amount: string }>>({});
  const [date, setDate] = useState(asOf);
  const [why, setWhy] = useState("");
  const filer = useFiler();

  const players = useMemo(
    () =>
      Object.entries(dest)
        .map(([playerId, to]) => {
          const c = BASE_CONTRACTS.find((x) => x.playerId === playerId);
          return c ? { playerId, name: c.playerName, pos: posOf(playerId), from: c.teamId, to } : null;
        })
        .filter((p): p is NonNullable<typeof p> => !!p && p.from !== p.to),
    [dest],
  );
  const picks = useMemo(
    () => Object.entries(pickDest).filter(([, v]) => v.from !== v.to).map(([id, v]) => ({ id, from: v.from, to: v.to, protection: v.protection.trim() || undefined })),
    [pickDest],
  );
  const cashLegs = useMemo(
    () => Object.entries(cash).map(([from, v]) => ({ from, to: v.to, amount: Number(v.amount) || 0 })).filter((c) => c.amount > 0 && c.from !== c.to),
    [cash],
  );
  const ruling = useMemo(() => ruleTrade({ players, picks, cash: cashLegs }), [players, picks, cashLegs]);
  const filing = { date, players, picks, cash: cashLegs, why };
  const rows = useMemo(() => (players.length ? tradeRows(filing, city) : []), [filing]);

  const setTeamAt = (i: number, t: string) => {
    const next = [...teams];
    next[i] = t;
    setTeams(next);
    setDest({});
    setPickDest({});
    setCash({});
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {teams.map((t, i) => (
          <div key={i} className="panel p-3">
            <div className="mb-2 flex items-center gap-2">
              <TeamLogo id={t} size={22} />
              <TeamSelect value={t} onChange={(v) => setTeamAt(i, v)} exclude={teams} />
              {teams.length > 2 && (
                <button type="button" className="admin-btn !px-2 !py-1 text-[11px]" onClick={() => setTeams(teams.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
            <div className="label mb-1 !text-[10px]">Players — pick a destination</div>
            <div className="max-h-[38vh] space-y-0.5 overflow-y-auto pr-1">
              {rosterOf(BASE_CONTRACTS, t).map((c) => (
                <div key={c.playerId} className="flex items-center gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 truncate">
                    {c.playerName}
                    {c.restriction && <span className="ml-1 text-[9px] font-bold text-[var(--tier-second_apron)]">NT</span>}
                  </span>
                  <span className="tabular w-16 text-right text-[var(--muted)]">{fmtM(currentSalary(c))}</span>
                  <select
                    className="admin-select !w-24 !py-0.5 !text-[11px]"
                    value={dest[c.playerId] ?? t}
                    onChange={(e) => setDest((d) => ({ ...d, [c.playerId]: e.target.value }))}
                  >
                    <option value={t}>stays</option>
                    {teams.filter((x) => x !== t).map((x) => (
                      <option key={x} value={x}>→ {x}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="label mb-1 mt-3 !text-[10px]">Picks</div>
            <div className="space-y-0.5">
              {tradeablePicks(PICK_RIGHTS, t, PICK_YEARS).map((p) => {
                const v = pickDest[p.id] ?? { from: t, to: t, protection: "" };
                return (
                  <div key={p.id} className="flex items-center gap-2 text-[12px]">
                    <span className="tabular min-w-0 flex-1">{p.label}</span>
                    {v.to !== t && (
                      <input className="admin-input !w-28 !py-0.5 !text-[11px]" placeholder="protection" value={v.protection} onChange={(e) => setPickDest((d) => ({ ...d, [p.id]: { ...v, protection: e.target.value } }))} />
                    )}
                    <select className="admin-select !w-24 !py-0.5 !text-[11px]" value={v.to} onChange={(e) => setPickDest((d) => ({ ...d, [p.id]: { from: t, to: e.target.value, protection: v.protection } }))}>
                      <option value={t}>stays</option>
                      {teams.filter((x) => x !== t).map((x) => (
                        <option key={x} value={x}>→ {x}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="label mb-1 mt-3 !text-[10px]">Cash out</div>
            <div className="flex items-center gap-2 text-[12px]">
              <input className="admin-input tabular !w-32 !py-0.5 !text-[11px]" type="number" placeholder="$" value={cash[t]?.amount ?? ""} onChange={(e) => setCash((c) => ({ ...c, [t]: { to: c[t]?.to ?? teams.find((x) => x !== t)!, amount: e.target.value } }))} />
              <select className="admin-select !w-24 !py-0.5 !text-[11px]" value={cash[t]?.to ?? teams.find((x) => x !== t)} onChange={(e) => setCash((c) => ({ ...c, [t]: { to: e.target.value, amount: c[t]?.amount ?? "" } }))}>
                {teams.filter((x) => x !== t).map((x) => (
                  <option key={x} value={x}>→ {x}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {teams.length < 3 && (
          <button type="button" className="panel flex items-center justify-center p-3 text-[12.5px] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]" onClick={() => setTeams([...teams, TEAMS_SORTED.find((x) => !teams.includes(x))!])}>
            + third team
          </button>
        )}
      </div>

      {ruling ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="panel p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[13.5px] font-bold">The docket</h3>
              <span className="label">{ruling.teams.join(" ⇄ ")}</span>
            </div>
            <TradeDocket teams={ruling.docket} stack />
          </div>
          <Receipt checks={ruling.checks} consequences={ruling.consequences} legal={ruling.legal} stamp={ruling.legal ? "Legal trade" : "Blocked"} />
        </div>
      ) : (
        <p className="text-[12.5px] text-[var(--muted)]">Send at least one player or pick somewhere and the engine will rule on it.</p>
      )}

      <Filing
        date={date} setDate={setDate} why={why} setWhy={setWhy} asOf={asOf}
        rows={rows}
        disabled={!ruling || (!players.length && !picks.length)}
        pending={filer.pending}
        result={filer.result}
        onFile={() => filer.run(() => fileTrade(filing))}
        extra={
          picks.length ? (
            <p className="mt-2 text-[11.5px] text-[var(--muted)]">
              {picks.length} pick{picks.length === 1 ? "" : "s"} will also move in pick-rights-2026.json (an own first becomes an obligation; an acquired pick changes holder).
              {!ruling?.legal && " The engine calls this blocked — filing it anyway records what the league did, not what the rules allow."}
            </p>
          ) : !ruling?.legal && ruling ? (
            <p className="mt-2 text-[11.5px] text-[var(--tier-taxpayer)]">The engine calls this blocked. Filing it records what the league did; the news card will show it as blocked too, which is the honest reading.</p>
          ) : null
        }
      />
    </div>
  );
}

/* --------------------------------- sign ----------------------------------- */

function SignTab({ initialTeam, initialPlayer, asOf }: { initialTeam: string; initialPlayer?: string; asOf: string }) {
  const [team, setTeam] = useState(initialTeam);
  const fas = useMemo(() => freeAgentsOf(BASE_CONTRACTS), []);
  const [q, setQ] = useState("");
  const [playerId, setPlayerId] = useState<string | undefined>(initialPlayer);
  const [outside, setOutside] = useState({ name: "", pos: "G" });
  const [y1, setY1] = useState("");
  const [years, setYears] = useState(1);
  const [mechanism, setMechanism] = useState<MechanismId | "">("");
  const [option, setOption] = useState("");
  const [consume, setConsume] = useState(true);
  const [date, setDate] = useState(asOf);
  const [why, setWhy] = useState("");
  const filer = useFiler();

  const fa = fas.find((f) => f.playerId === playerId);
  const name = fa?.playerName ?? outside.name;
  const pos = fa ? posOf(fa.playerId) : outside.pos;
  const salary = Math.round(Number(y1)) || 0;
  const ruling = useMemo(
    () => (name && salary > 0 ? ruleSigning({ playerId: fa?.playerId, playerName: name, team, y1: salary, years, mechanism: mechanism || undefined }) : null),
    [name, salary, team, years, mechanism, fa?.playerId],
  );
  const mech = ruling?.mechanism?.id;
  const consumable = mech === "ntmle" || mech === "tpmle" || mech === "bae" || mech === "room_mle";
  const filing = ruling
    ? {
        date,
        player: { name, pos },
        team,
        years,
        total: ruling.booking.total,
        mechanism: ruling.mechanism?.id,
        reSign: ruling.isOwn,
        option: option.trim() || undefined,
        why,
        consume: consumable && consume ? { mechanism: mech as "ntmle" | "tpmle" | "bae" | "room_mle", amount: ruling.booking.deemedY1 } : undefined,
      }
    : null;
  const rows = filing ? [signingRow(filing, city)] : [];
  const list = fas.filter((f) => !q || f.playerName.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="panel p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Signing team"><TeamSelect value={team} onChange={setTeam} /></Field>
            <Field label="Find a free agent">
              <input className="admin-input" placeholder="name…" value={q} onChange={(e) => setQ(e.target.value)} />
            </Field>
          </div>
          <div className="mt-2 max-h-[30vh] overflow-y-auto rounded-md border border-[var(--border)]">
            {list.map((f) => (
              <button
                key={f.playerId}
                type="button"
                onClick={() => setPlayerId(f.playerId)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-[var(--panel-2)] ${playerId === f.playerId ? "bg-[var(--panel-2)] font-semibold" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{f.playerName}</span>
                <span className="text-[10px] text-[var(--muted)]">{f.priorTeam} · {f.birdStatus.replace("_", "-")}{f.faType ? ` · ${f.faType}` : ""}</span>
                <span className="tabular w-16 text-right text-[var(--muted)]">{fmtM(f.lastSalary)}</span>
              </button>
            ))}
          </div>
          <details className="mt-2 text-[12px]">
            <summary className="cursor-pointer text-[var(--muted)]">Not on the free-agent list (overseas, retired, two-way)? Name him.</summary>
            <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
              <input className="admin-input" placeholder="Full name as the feed spells it" value={outside.name} onChange={(e) => { setPlayerId(undefined); setOutside({ ...outside, name: e.target.value }); }} />
              <input className="admin-input" placeholder="pos" value={outside.pos} onChange={(e) => setOutside({ ...outside, pos: e.target.value })} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">A player with no sheet row needs a stub in extra-contracts.json for the deal to land — add one from the files page first.</p>
          </details>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Year-one salary ($)">
              <input className="admin-input tabular" type="number" step={1} value={y1} onChange={(e) => setY1(e.target.value)} />
            </Field>
            <Field label="Seasons">
              <input className="admin-input tabular" type="number" min={1} max={5} value={years} onChange={(e) => setYears(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Mechanism">
              <select className="admin-select" value={mechanism} onChange={(e) => setMechanism(e.target.value as MechanismId | "")}>
                <option value="">engine picks</option>
                {(ruling?.available ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.label} · {fmtM(m.maxSalary)}</option>
                ))}
              </select>
            </Field>
            <Field label="Option (text)">
              <input className="admin-input" placeholder="2027-28 Player Option" value={option} onChange={(e) => setOption(e.target.value)} />
            </Field>
          </div>
          {ruling && (
            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--panel-2)]/50 p-2.5 text-[12px]">
              <div className="label mb-1 !text-[10px]">What the pipeline will book from the filed row</div>
              <div className="tabular">
                {ruling.booking.years.map((y) => `${y.leagueYear} ${fmtFull(y.salary)}`).join(" · ")} — total ${(ruling.booking.total / 1e6).toFixed(3)}M at {Math.round(ruling.booking.raise * 100)}% raises
                {ruling.booking.deemedY1 !== ruling.booking.years[0]?.salary ? ` (year one deemed ${fmtFull(ruling.booking.deemedY1)})` : ""}
              </div>
              {consumable && (
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={consume} onChange={(e) => setConsume(e.target.checked)} />
                  Record {MECHANISM_TEXT[mech!]} use of {fmtFull(ruling.booking.deemedY1)} in feed-team-state.json{ruling.mechanism?.hardCap ? ` (and the ${ruling.mechanism.hardCap === "first_apron" ? "first" : "second"}-apron hard cap)` : ""}
                </label>
              )}
            </div>
          )}
        </div>
        {ruling ? (
          <Receipt checks={ruling.checks} consequences={ruling.consequences} legal={ruling.legal} stamp={ruling.legal ? "Legal signing" : "Doesn't fit"} />
        ) : (
          <div className="panel p-4 text-[12.5px] text-[var(--muted)]">Pick a player and a year-one salary; the engine reports which mechanism reaches it, what it does to the team's line, and any hard cap it triggers.</div>
        )}
      </div>
      <Filing
        date={date} setDate={setDate} why={why} setWhy={setWhy} asOf={asOf}
        rows={rows}
        disabled={!filing}
        pending={filer.pending}
        result={filer.result}
        onFile={() => filing && filer.run(() => fileSigning(filing))}
      />
    </div>
  );
}

/* --------------------------------- waive ---------------------------------- */

function RosterPick({ team, value, onChange }: { team: string; value?: string; onChange: (id: string) => void }) {
  return (
    <select className="admin-select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">choose a player…</option>
      {rosterOf(BASE_CONTRACTS, team).map((c) => (
        <option key={c.playerId} value={c.playerId}>{c.playerName} · {fmtM(currentSalary(c))}</option>
      ))}
    </select>
  );
}

function WaiveTab({ initialTeam, initialPlayer, asOf }: { initialTeam: string; initialPlayer?: string; asOf: string }) {
  const [team, setTeam] = useState(initialTeam);
  const [playerId, setPlayerId] = useState(initialPlayer);
  const [stretch, setStretch] = useState(false);
  const [date, setDate] = useState(asOf);
  const [why, setWhy] = useState("");
  const filer = useFiler();
  const c = BASE_CONTRACTS.find((x) => x.playerId === playerId && !x.deadMoney);
  const ruling = useMemo(() => (playerId ? ruleWaive(playerId) : null), [playerId]);
  const filing = c && ruling ? { date, player: { name: c.playerName, pos: posOf(c.playerId) }, team: c.teamId, guaranteed: ruling.guaranteedTotal, stretch, why } : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Team"><TeamSelect value={team} onChange={(t) => { setTeam(t); setPlayerId(undefined); }} /></Field>
            <Field label="Player"><RosterPick team={team} value={playerId} onChange={setPlayerId} /></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={stretch} onChange={(e) => setStretch(e.target.checked)} />
            Stretch the guaranteed remainder (Art. VII §7(d)(5): over 2 × seasons left + 1)
          </label>
        </div>
        {ruling && c ? (
          <Receipt
            legal={!stretch || ruling.stretch.legal || ruling.guaranteedTotal === 0}
            stamp={ruling.guaranteedTotal === 0 ? "Clean cut" : stretch ? (ruling.stretch.legal ? "Legal stretch" : "Over 15%") : "Dead money"}
            checks={[
              { ok: true, text: `${c.playerName}'s guaranteed remainder is ${fmtFull(ruling.guaranteedTotal)}${ruling.guaranteedTotal ? ` over ${ruling.straightYears.map((y) => `${y.leagueYear} ${fmtM(y.salary)}`).join(", ")}` : " — nothing sticks to the books"}.` },
              stretch && ruling.guaranteedTotal > 0
                ? { ok: ruling.stretch.legal, text: `Stretched: ${fmtFull(Math.round(ruling.stretch.perYear))} a season for ${ruling.stretch.years} seasons${ruling.stretch.legal ? "" : " — over the 15%-of-cap guardrail"}.` }
                : { ok: true, text: "Charged as scheduled." },
              { ok: true, text: `${team} moves from ${fmtM(ruling.before)} to ${fmtM(stretch ? ruling.afterStretch : ruling.afterStraight)} in ${YEAR}.` },
            ]}
            consequences={[]}
          />
        ) : (
          <div className="panel p-4 text-[12.5px] text-[var(--muted)]">Choose a player to see what sticks to the books.</div>
        )}
      </div>
      <Filing
        date={date} setDate={setDate} why={why} setWhy={setWhy} asOf={asOf}
        rows={filing ? [waiveRow(filing, city)] : []}
        disabled={!filing}
        pending={filer.pending}
        result={filer.result}
        onFile={() => filing && filer.run(() => fileWaive(filing))}
      />
    </div>
  );
}

/* --------------------------------- option --------------------------------- */

function OptionTab({ initialTeam, initialPlayer, asOf }: { initialTeam: string; initialPlayer?: string; asOf: string }) {
  const [team, setTeam] = useState(initialTeam);
  const [playerId, setPlayerId] = useState(initialPlayer);
  const [kind, setKind] = useState<"player" | "team">("player");
  const [decision, setDecision] = useState<"exercised" | "declined">("declined");
  const [season, setSeason] = useState(YEAR);
  const [date, setDate] = useState(asOf);
  const [why, setWhy] = useState("");
  const filer = useFiler();
  const c = BASE_CONTRACTS.find((x) => x.playerId === playerId && !x.deadMoney);
  const filing = c ? { date, player: { name: c.playerName, pos: posOf(c.playerId) }, team: c.teamId, season, kind, decision, why } : null;
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Team"><TeamSelect value={team} onChange={(t) => { setTeam(t); setPlayerId(undefined); }} /></Field>
          <Field label="Player"><RosterPick team={team} value={playerId} onChange={setPlayerId} /></Field>
          <Field label="Option">
            <select className="admin-select" value={kind} onChange={(e) => setKind(e.target.value as "player" | "team")}>
              <option value="player">player option</option>
              <option value="team">team option</option>
            </select>
          </Field>
          <Field label="Decision">
            <select className="admin-select" value={decision} onChange={(e) => setDecision(e.target.value as "exercised" | "declined")}>
              <option value="declined">declined</option>
              <option value="exercised">exercised</option>
            </select>
          </Field>
          <Field label="Season"><input className="admin-input tabular" value={season} onChange={(e) => setSeason(e.target.value)} /></Field>
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--muted)]">A declined {YEAR} option strips that season from the contract, so the player joins the free-agent pool with a hold. An exercised option is informational: the sheet already carries the year.</p>
      </div>
      <Filing
        date={date} setDate={setDate} why={why} setWhy={setWhy} asOf={asOf}
        rows={filing ? [optionRow(filing, city)] : []}
        disabled={!filing}
        pending={filer.pending}
        result={filer.result}
        onFile={() => filing && filer.run(() => fileOption(filing))}
      />
    </div>
  );
}

/* --------------------------------- extend --------------------------------- */

function ExtendTab({ initialTeam, initialPlayer, asOf }: { initialTeam: string; initialPlayer?: string; asOf: string }) {
  const [team, setTeam] = useState(initialTeam);
  const [playerId, setPlayerId] = useState(initialPlayer);
  const [n, setN] = useState(2);
  const [first, setFirst] = useState("");
  const [raise, setRaise] = useState(8);
  const [date, setDate] = useState(asOf);
  const [why, setWhy] = useState("");
  const filer = useFiler();
  const c = BASE_CONTRACTS.find((x) => x.playerId === playerId && !x.deadMoney);
  const prov = c ? provenanceOf(c) : null;
  const last = c ? [...c.years].sort((a, b) => a.leagueYear.localeCompare(b.leagueYear)).at(-1) : undefined;
  const startYear = last ? Number(last.leagueYear.slice(0, 4)) + 1 : 2027;
  const y1 = Math.round(Number(first)) || 0;
  const newYears = y1 > 0
    ? Array.from({ length: Math.max(1, Math.min(4, n)) }, (_, k) => ({
        leagueYear: `${startYear + k}-${String((startYear + 1 + k) % 100).padStart(2, "0")}`,
        salary: Math.round(y1 * (1 + (raise / 100) * k)),
        guarantee: "full" as const,
      }))
    : [];
  const total = newYears.reduce((s, y) => s + y.salary, 0);
  const canFile = !!c && !!prov?.source && newYears.length > 0;
  const filing = c && prov?.source
    ? {
        date,
        player: { name: c.playerName, pos: posOf(c.playerId) },
        team: c.teamId,
        years: newYears.length,
        total,
        why,
        playerId: c.playerId,
        source: { id: prov.source.id as "contracts" | "extraContracts" | "rookies", index: prov.source.index },
        newYears,
      }
    : null;
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Team"><TeamSelect value={team} onChange={(t) => { setTeam(t); setPlayerId(undefined); }} /></Field>
          <Field label="Player"><RosterPick team={team} value={playerId} onChange={setPlayerId} /></Field>
          <Field label="Seasons added"><input className="admin-input tabular" type="number" min={1} max={4} value={n} onChange={(e) => setN(Number(e.target.value) || 1)} /></Field>
          <Field label={`First new season ($, ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")})`}><input className="admin-input tabular" type="number" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
          <Field label="Raise %"><input className="admin-input tabular" type="number" min={0} max={8} value={raise} onChange={(e) => setRaise(Number(e.target.value) || 0)} /></Field>
        </div>
        {c && (
          <div className="mt-3 text-[12px]">
            <span className="text-[var(--muted)]">On the books through</span> <span className="tabular">{last?.leagueYear} ({fmtFull(last?.salary ?? 0)})</span>
            {newYears.length > 0 && (
              <span className="tabular"> → adds {newYears.map((y) => `${y.leagueYear} ${fmtFull(y.salary)}`).join(", ")}</span>
            )}
            {prov && !prov.source && <div className="mt-1 text-[var(--tier-second_apron)]">This line has no raw row to extend.</div>}
            {prov?.source && <div className="mt-1 text-[var(--muted)]">Writes the seasons onto {prov.source.file} (index {prov.source.index}) and files an Extension row for the record. Extend-and-trade limits (Art. VII §8(f)) are applied when the sheet rebuilds.</div>}
          </div>
        )}
      </div>
      <Filing
        date={date} setDate={setDate} why={why} setWhy={setWhy} asOf={asOf}
        rows={filing ? [extensionRow(filing, city)] : []}
        disabled={!canFile}
        pending={filer.pending}
        result={filer.result}
        onFile={() => filing && filer.run(() => fileExtension(filing))}
      />
    </div>
  );
}

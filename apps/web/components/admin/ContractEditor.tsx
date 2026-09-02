"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateContractRow, GUARANTEE_TYPES, BIRD_STATUSES, DATA_AS_OF, type Issue } from "@apron/data";
import { TEAM_IDS } from "@/lib/league";
import { saveContractRow, fileStatedSalary, type ActionResult } from "@/app/admin/actions";
import { fmtFull } from "@/lib/format";

type Year = { leagueYear: string; salary: number; guarantee: string };
type Source = { id: "contracts" | "extraContracts" | "rookies"; index: number };

const nextSeason = (y: string) => {
  const n = Number(y.slice(0, 4)) + 1;
  return `${n}-${String((n + 1) % 100).padStart(2, "0")}`;
};

/**
 * Edits the raw contract row in place — seasons, guarantees, and the flags
 * the engine reads — validating against the schema as you type, and writing
 * only when it is clean. The "stated 2026-27 cap hit" filing is separate on
 * purpose: when a feed pass owns the current-year number, that row is the
 * lever that actually moves it.
 */
export function ContractEditor({
  source,
  row,
  reconciled,
  governed,
}: {
  source: Source;
  row: Record<string, unknown>;
  reconciled: { playerId: string; playerName: string; teamId: string; pos: string };
  governed: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<string, unknown>>(row);
  const [msg, setMsg] = useState<ActionResult<unknown> | null>(null);
  const years = (draft.years as Year[]) ?? [];

  const issues: Issue[] = useMemo(
    () => validateContractRow(draft, "row", { teams: new Set(TEAM_IDS) }, source.id === "rookies" ? ["pick", "round"] : ["why"]),
    [draft, source.id],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);

  const set = (k: string, v: unknown) =>
    setDraft((d) => {
      const n = { ...d };
      if (v === undefined || v === "" || v === false) delete n[k];
      else n[k] = v;
      return n;
    });
  const setYear = (i: number, patch: Partial<Year>) =>
    set("years", years.map((y, j) => (j === i ? { ...y, ...patch } : y)));

  const save = () =>
    start(async () => {
      const r = await saveContractRow(source, draft);
      setMsg(r);
      if (r.ok) {
        // Give the dev server a beat to recompile the JSON module before the
        // reconciled table above re-renders from it.
        await new Promise((res) => setTimeout(res, 900));
        router.refresh();
      }
    });

  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-bold">Raw row</h3>
        <span className="label">
          {source.id === "contracts" ? "contracts-2025-26.json" : source.id === "extraContracts" ? "extra-contracts.json" : "rookies-2026.json"} · index {source.index}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Player id">
          <input className="admin-input admin-mono" value={String(draft.playerId ?? "")} onChange={(e) => set("playerId", e.target.value)} />
        </Field>
        <Field label="Name">
          <input className="admin-input" value={String(draft.playerName ?? "")} onChange={(e) => set("playerName", e.target.value)} />
        </Field>
        <Field label="Team (raw)">
          <select className="admin-select" value={String(draft.teamId ?? "")} onChange={(e) => set("teamId", e.target.value)}>
            {TEAM_IDS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Years of service">
          <input className="admin-input tabular" type="number" min={0} max={25} value={draft.yearsOfService == null ? "" : Number(draft.yearsOfService)} onChange={(e) => set("yearsOfService", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
      </div>

      <div className="mt-4">
        <div className="label mb-1 !text-[10px]">Seasons</div>
        <table className="admin-table">
          <thead>
            <tr><th>Season</th><th className="text-right">Salary</th><th>Guarantee</th><th></th></tr>
          </thead>
          <tbody>
            {years.map((y, i) => (
              <tr key={i}>
                <td>
                  <input className="admin-input admin-mono w-28" value={y.leagueYear} onChange={(e) => setYear(i, { leagueYear: e.target.value })} />
                </td>
                <td className="text-right">
                  <input className="admin-input tabular w-40 text-right" type="number" step={1} min={0} value={y.salary} onChange={(e) => setYear(i, { salary: Number(e.target.value) })} />
                  <div className="text-[10px] text-[var(--muted)]">{fmtFull(y.salary)}</div>
                </td>
                <td>
                  <select className="admin-select w-40" value={y.guarantee} onChange={(e) => setYear(i, { guarantee: e.target.value })}>
                    {GUARANTEE_TYPES.map((g) => (
                      <option key={g} value={g}>{g.replace("_", " ")}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" className="admin-btn admin-btn-danger !px-2 !py-1 text-[11px]" onClick={() => set("years", years.filter((_, j) => j !== i))}>remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="admin-btn mt-2 text-[11.5px]"
          onClick={() => {
            const last = years[years.length - 1];
            set("years", [...years, { leagueYear: last ? nextSeason(last.leagueYear) : "2026-27", salary: last ? Math.round(last.salary * 1.05) : 0, guarantee: "full" }]);
          }}
        >
          + add a season
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Trade kicker (0–0.15)">
          <input className="admin-input tabular" type="number" step={0.01} min={0} max={0.15} value={draft.tradeKickerPct == null ? "" : Number(draft.tradeKickerPct)} onChange={(e) => set("tradeKickerPct", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="Bird status">
          <select className="admin-select" value={String(draft.birdStatus ?? "")} onChange={(e) => set("birdStatus", e.target.value || undefined)}>
            <option value="">(unset)</option>
            {BIRD_STATUSES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </Field>
        <Field label="Signed using">
          <input className="admin-input" value={String(draft.signedUsing ?? "")} onChange={(e) => set("signedUsing", e.target.value || undefined)} />
        </Field>
        <Field label="Restriction (why he can't be traded)">
          <input className="admin-input" value={String(draft.restriction ?? "")} onChange={(e) => set("restriction", e.target.value || undefined)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px]">
        {(["noTradeClause", "twoWay", "minimumSalary", "deadMoney", "signedAsFreeAgent", "noAggregate"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!draft[k]} onChange={(e) => set(k, e.target.checked)} />
            {k}
          </label>
        ))}
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[12px] text-[var(--tier-second_apron)]">
          {issues.map((i, k) => (
            <li key={k}><span className="admin-mono">{i.path}</span> — {i.message}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="admin-btn admin-btn-primary" disabled={!dirty || issues.length > 0 || pending} onClick={save}>
          {pending ? "Saving…" : "Save the raw row"}
        </button>
        <button type="button" className="admin-btn" disabled={!dirty || pending} onClick={() => setDraft(row)}>Reset</button>
        {msg && <Status r={msg} />}
      </div>

      {governed !== "base" && governed !== "rookie" && governed !== "release" && (
        <StatedSalary reconciled={reconciled} />
      )}
    </section>
  );
}

function StatedSalary({ reconciled }: { reconciled: { playerId: string; playerName: string; teamId: string; pos: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [salary, setSalary] = useState("");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState<ActionResult<unknown> | null>(null);
  return (
    <div className="mt-5 rounded-md border border-[var(--accent)]/40 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] p-3">
      <div className="label mb-1 !text-[10px] !text-[var(--accent-ink)]">Set the 2026-27 cap hit outright</div>
      <p className="text-[12px] text-[var(--muted)]">
        A feed pass owns this player's current-year number, so the raw salary above is not what shows. This files a curated row (&ldquo;fully guaranteed $X million salary for 2026-27&rdquo;), which the stated-salary pass takes over anything back-solved.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[12rem_1fr_auto]">
        <input className="admin-input tabular" type="number" step={1} placeholder="exact dollars" value={salary} onChange={(e) => setSalary(e.target.value)} />
        <input className="admin-input" placeholder="why — the source and the arithmetic" value={why} onChange={(e) => setWhy(e.target.value)} />
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          disabled={pending || !Number(salary) || why.trim().length < 8}
          onClick={() =>
            start(async () => {
              const r = await fileStatedSalary({
                date: DATA_AS_OF,
                player: { name: reconciled.playerName, pos: reconciled.pos || "—" },
                team: reconciled.teamId,
                salary: Math.round(Number(salary)),
                why: why.trim(),
              });
              setMsg(r);
              if (r.ok) {
                await new Promise((res) => setTimeout(res, 900));
                router.refresh();
              }
            })
          }
        >
          {pending ? "Filing…" : "File the stated salary"}
        </button>
      </div>
      {msg && <div className="mt-2"><Status r={msg} /></div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block !text-[10px]">{label}</span>
      {children}
    </label>
  );
}

export function Status({ r }: { r: ActionResult<unknown> }) {
  return r.ok ? (
    <span className="text-[12px] font-semibold text-[var(--tier-below_cap)]">✓ {r.message}</span>
  ) : (
    <span className="text-[12px] text-[var(--tier-second_apron)]">
      ✗ {r.error}
      {r.issues?.length ? ` — ${r.issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join("; ")}` : ""}
    </span>
  );
}

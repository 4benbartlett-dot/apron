"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TRANSACTION_TYPES, validateTransactionRow, type Transaction } from "@apron/data";
import { appendManualMoves, updateManualMove, deleteManualMove, addFeedCorrection, type ActionResult } from "@/app/admin/actions";
import { Field, Status } from "@/components/admin/ContractEditor";

interface Correction { date: string; player: string; type: string; detail: string; why: string }

const TYPE_COLOR: Record<string, string> = {
  Trade: "var(--tier-second_apron)",
  Signing: "var(--tier-below_cap)",
  "Re-sign": "var(--tier-below_cap)",
  Extension: "var(--tier-taxpayer)",
  Release: "var(--muted)",
  "Qualifying Offer": "var(--tier-over_cap)",
  Option: "var(--tier-over_cap)",
  Renounce: "var(--muted)",
  Other: "var(--muted)",
};

const EMPTY: Transaction & { why: string } = { player: "", pos: "", date: "", type: "Signing", detail: "", why: "" };

export function LedgerEditor({ moves, moveNote, corrections, feed, merged }: { moves: Transaction[]; moveNote: string; corrections: Correction[]; feed: Transaction[]; merged: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Transaction & { why?: string }>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [corr, setCorr] = useState<Correction>({ date: "", player: "", type: "Trade", detail: "", why: "" });

  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setEditing(null);
        setAdding(false);
        await new Promise((res) => setTimeout(res, 700));
        router.refresh();
      }
    });
  const issues = useMemo(() => validateTransactionRow(draft, "row"), [draft]);
  const feedRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = needle ? feed.filter((t) => `${t.player} ${t.detail} ${t.date} ${t.type}`.toLowerCase().includes(needle)) : feed;
    return rows.slice(0, 150);
  }, [feed, q]);

  const form = (
    <div className="rounded-md border border-[var(--accent)]/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_9rem_10rem]">
        <Field label="Player"><input className="admin-input" value={draft.player} onChange={(e) => setDraft({ ...draft, player: e.target.value })} /></Field>
        <Field label="Pos"><input className="admin-input" value={draft.pos} onChange={(e) => setDraft({ ...draft, pos: e.target.value })} /></Field>
        <Field label="Date (Sep 02, 2026)"><input className="admin-input tabular" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
        <Field label="Type">
          <select className="admin-select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-2">
        <Field label="Detail — the feed's prose, which the pipeline parses">
          <textarea className="admin-textarea" rows={2} value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} />
        </Field>
      </div>
      <div className="mt-2">
        <Field label="Why — source and arithmetic">
          <textarea className="admin-textarea" rows={2} value={draft.why ?? ""} onChange={(e) => setDraft({ ...draft, why: e.target.value })} />
        </Field>
      </div>
      {issues.length > 0 && (
        <ul className="mt-2 text-[11.5px] text-[var(--tier-second_apron)]">{issues.map((i, k) => <li key={k}>{i.path} — {i.message}</li>)}</ul>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          disabled={pending || issues.length > 0 || !(draft.why ?? "").trim()}
          onClick={() => run(() => (editing == null ? appendManualMoves([draft]) : updateManualMove(editing, draft)))}
        >
          {editing == null ? "Add the row" : "Save the row"}
        </button>
        <button type="button" className="admin-btn" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Curated moves <span className="text-[var(--muted)]">({moves.length})</span></h2>
            <p className="mt-0.5 max-w-3xl text-[11.5px] text-[var(--muted)]">{moveNote}</p>
          </div>
          <div className="flex items-center gap-3">
            {result && <Status r={result} />}
            <button type="button" className="admin-btn" onClick={() => { setAdding(true); setEditing(null); setDraft(EMPTY); }}>+ Add a row by hand</button>
          </div>
        </div>
        {adding && <div className="mb-3">{form}</div>}
        <div className="panel divide-y divide-[var(--border)]/60">
          {moves.map((m, i) => (
            <div key={i} className="px-4 py-2.5">
              {editing === i ? (
                form
              ) : (
                <div className="flex items-start gap-3">
                  <span className="admin-tag mt-0.5 shrink-0" style={{ color: TYPE_COLOR[m.type] ?? "var(--muted)", background: `color-mix(in srgb, ${TYPE_COLOR[m.type] ?? "var(--muted)"} 12%, transparent)` }}>{m.type}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px]"><span className="font-semibold">{m.player}</span> <span className="text-[var(--muted)]">({m.pos}) · {m.date}</span></div>
                    <div className="text-[12.5px]">{m.detail}</div>
                    {(m as { why?: string }).why && <div className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{(m as { why?: string }).why}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="admin-btn !px-2 !py-1 text-[11px]" onClick={() => { setEditing(i); setAdding(false); setDraft({ ...m }); }}>edit</button>
                    <button type="button" className="admin-btn admin-btn-danger !px-2 !py-1 text-[11px]" disabled={pending} onClick={() => { if (confirm(`Remove the ${m.player} row?`)) run(() => deleteManualMove(i)); }}>remove</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!moves.length && <div className="px-4 py-3 text-[12px] text-[var(--muted)]">No curated rows.</div>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-bold tracking-tight">Feed corrections <span className="text-[var(--muted)]">({corrections.length})</span></h2>
        <div className="panel divide-y divide-[var(--border)]/60">
          {corrections.map((c, i) => (
            <div key={i} className="px-4 py-2.5 text-[12.5px]">
              <div><span className="font-semibold">{c.player}</span> <span className="text-[var(--muted)]">· {c.date} · {c.type}</span></div>
              <div>{c.detail}</div>
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">{c.why}</div>
            </div>
          ))}
          <div className="p-3">
            <div className="label mb-1.5 !text-[10px]">Correct a feed row (matched on date + player + type; applied on the next scrape)</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_1fr_9rem]">
              <input className="admin-input tabular" placeholder="Sep 02, 2026" value={corr.date} onChange={(e) => setCorr({ ...corr, date: e.target.value })} />
              <input className="admin-input" placeholder="Player, exactly as the feed spells it" value={corr.player} onChange={(e) => setCorr({ ...corr, player: e.target.value })} />
              <select className="admin-select" value={corr.type} onChange={(e) => setCorr({ ...corr, type: e.target.value })}>
                {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <textarea className="admin-textarea mt-2" rows={2} placeholder="The corrected detail" value={corr.detail} onChange={(e) => setCorr({ ...corr, detail: e.target.value })} />
            <input className="admin-input mt-2" placeholder="Why the feed is wrong, with the source" value={corr.why} onChange={(e) => setCorr({ ...corr, why: e.target.value })} />
            <button type="button" className="admin-btn admin-btn-primary mt-2" disabled={pending || !corr.date || !corr.player || !corr.detail || !corr.why} onClick={() => run(() => addFeedCorrection(corr))}>Add the correction</button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-tight">Scraped feed <span className="text-[var(--muted)]">({feed.length} rows · {merged} merged with curated)</span></h2>
          <input className="admin-input !w-72" placeholder="search the feed…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="panel max-h-[60vh] divide-y divide-[var(--border)]/50 overflow-y-auto">
          {feedRows.map((t, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2 text-[12.5px]">
              <span className="admin-tag mt-0.5 shrink-0" style={{ color: TYPE_COLOR[t.type] ?? "var(--muted)", background: `color-mix(in srgb, ${TYPE_COLOR[t.type] ?? "var(--muted)"} 12%, transparent)` }}>{t.type}</span>
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{t.player}</span> <span className="text-[var(--muted)]">({t.pos})</span> — {t.detail}
              </div>
              <span className="tabular shrink-0 text-[11px] text-[var(--muted)]">{t.date}</span>
              <button type="button" className="admin-btn !px-2 !py-0.5 text-[10.5px]" onClick={() => { setCorr({ date: t.date, player: t.player, type: t.type, detail: t.detail, why: "" }); window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "smooth" }); }}>correct</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

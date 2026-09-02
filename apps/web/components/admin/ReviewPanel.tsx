"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DirtyFile, CommitInfo } from "@/lib/admin/git";
import type { CheckResult } from "@/lib/admin/checks";
import { gitDiff, runChecks, commitFiles, type ActionResult } from "@/app/admin/actions";
import { Status } from "@/components/admin/ContractEditor";
import { DiffView } from "@/components/admin/DiffView";

export function ReviewPanel({ dirty, commit, branch, checks }: { dirty: DirtyFile[]; commit: CommitInfo; branch: string; checks: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [diffs, setDiffs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(dirty.map((d) => d.path)));
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<ActionResult<unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const fileName = (path: string) => path.split("/").pop()!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Review &amp; commit</h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            On <span className="admin-mono">{branch}</span> at <span className="admin-mono">{commit.hash}</span> — {commit.subject} ({commit.date.slice(0, 16)}). Only packages/data/src is ever staged from here.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
          <span className="text-[13px] font-bold">Uncommitted data files <span className="text-[var(--muted)]">({dirty.length})</span></span>
          {dirty.length > 0 && (
            <button type="button" className="text-[11.5px] text-[var(--muted)] underline decoration-dotted underline-offset-2" onClick={() => setSelected(selected.size === dirty.length ? new Set() : new Set(dirty.map((d) => d.path)))}>
              {selected.size === dirty.length ? "select none" : "select all"}
            </button>
          )}
        </div>
        {dirty.length === 0 && <div className="px-4 py-3 text-[12.5px] text-[var(--muted)]">Nothing to commit — the data tree matches HEAD.</div>}
        {dirty.map((d) => (
          <div key={d.path} className="border-b border-[var(--border)]/60 last:border-0">
            <div className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
              <input type="checkbox" checked={selected.has(d.path)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(d.path); else s.delete(d.path); setSelected(s); }} />
              <span className="admin-mono w-8 text-[var(--muted)]">{d.status.trim() || "M"}</span>
              <span className="admin-mono min-w-0 flex-1 truncate">{d.path}</span>
              {d.insertions != null && <span className="tabular text-[11px]"><span className="text-[var(--tier-below_cap)]">+{d.insertions}</span> <span className="text-[var(--tier-second_apron)]">−{d.deletions}</span></span>}
              <button type="button" className="admin-btn !px-2 !py-0.5 text-[11px]" disabled={pending} onClick={() => start(async () => { const r = await gitDiff(fileName(d.path)); setDiffs((x) => ({ ...x, [d.path]: r.ok ? r.value : r.error })); })}>
                {diffs[d.path] ? "refresh diff" : "diff"}
              </button>
            </div>
            {diffs[d.path] && <div className="px-4 pb-3"><DiffView text={diffs[d.path]!} /></div>}
          </div>
        ))}
      </section>

      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-bold">Checks</div>
            <div className="text-[11.5px] text-[var(--muted)]">{checks.join(" · ")}</div>
          </div>
          <button
            type="button"
            className="admin-btn"
            disabled={running}
            onClick={() => {
              setRunning(true);
              setResults(null);
              runChecks().then((r) => {
                setResults(r.ok ? r.value : [{ name: "checks", ok: false, output: r.error, ms: 0 }]);
                setRunning(false);
              });
            }}
          >
            {running ? "Running… (a minute or so)" : "Run the checks"}
          </button>
        </div>
        {results && (
          <div className="mt-3 space-y-2">
            {results.map((r) => (
              <details key={r.name} open={!r.ok} className="rounded-md border border-[var(--border)]">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px]">
                  <span className="font-bold" style={{ color: r.ok ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>{r.ok ? "✓" : "✗"}</span>
                  <span className="font-semibold">{r.name}</span>
                  <span className="tabular ml-auto text-[11px] text-[var(--muted)]">{(r.ms / 1000).toFixed(1)}s</span>
                </summary>
                <pre className="admin-diff max-h-72 overflow-auto border-t border-[var(--border)] px-3 py-2">{r.output}</pre>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="panel p-4">
        <div className="text-[13px] font-bold">Commit</div>
        <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">Say what the data now claims and why — the source, the arithmetic, the number that moved. The history of this repo is the audit trail.</p>
        <textarea className="admin-textarea mt-2" rows={6} placeholder={"Data to Sep 3: …\n\nWhat changed, what it was checked against, what the measured cost is."} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={pending || !message.trim() || selected.size === 0}
            onClick={() =>
              start(async () => {
                const r = await commitFiles(message, [...selected].map(fileName));
                setOutcome(r);
                if (r.ok) {
                  setMessage("");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Committing…" : `Commit ${selected.size} file${selected.size === 1 ? "" : "s"}`}
          </button>
          {outcome && <Status r={outcome} />}
          <span className="text-[11px] text-[var(--muted)]">Push is yours: <span className="admin-mono">git push</span> redeploys Vercel.</span>
        </div>
      </section>
    </div>
  );
}

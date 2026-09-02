"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateDataFile, type Issue, type SchemaId } from "@apron/data";
import { TEAM_IDS } from "@/lib/league";
import { saveRawFile, gitDiff, type ActionResult } from "@/app/admin/actions";
import { Status } from "@/components/admin/ContractEditor";
import { DiffView } from "@/components/admin/DiffView";

const TEAMS = new Set(TEAM_IDS);

/** Textarea over the raw JSON, validated against the file's schema as you type. */
export function JsonEditor({ id, file, text, mtime, bytes, readOnly }: { id: SchemaId; file: string; text: string; mtime: string; bytes: number; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(text);
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const { parseError, issues } = useMemo<{ parseError: string | null; issues: Issue[] }>(() => {
    try {
      const json = JSON.parse(draft);
      return { parseError: null, issues: validateDataFile(id, json, { teams: TEAMS }) };
    } catch (err) {
      return { parseError: (err as Error).message, issues: [] };
    }
  }, [draft, id]);
  const dirty = draft !== text;
  const lines = draft.split("\n").length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--muted)]">
        <span className="tabular">{lines.toLocaleString()} lines · {(bytes / 1024).toFixed(1)} KB · saved {new Date(mtime).toLocaleString()}</span>
        <span style={{ color: parseError || issues.length ? "var(--tier-second_apron)" : "var(--tier-below_cap)" }}>
          {parseError ? `not JSON: ${parseError}` : issues.length ? `${issues.length} schema issue${issues.length === 1 ? "" : "s"}` : "valid"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" className="admin-btn !py-1 text-[11.5px]" disabled={pending} onClick={() => start(async () => { const r = await gitDiff(file); setDiff(r.ok ? r.value : r.error); })}>
            {diff == null ? "Show diff vs HEAD" : "Refresh diff"}
          </button>
          {!readOnly && (
            <>
              <button type="button" className="admin-btn !py-1 text-[11.5px]" disabled={!dirty || pending} onClick={() => setDraft(text)}>Reset</button>
              <button
                type="button"
                className="admin-btn admin-btn-primary !py-1 text-[11.5px]"
                disabled={!dirty || pending || !!parseError || issues.length > 0}
                onClick={() =>
                  start(async () => {
                    const r = await saveRawFile(id, draft);
                    setResult(r);
                    if (r.ok) {
                      await new Promise((res) => setTimeout(res, 700));
                      router.refresh();
                    }
                  })
                }
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </span>
      </div>
      {issues.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-[var(--tier-second_apron)]/40 bg-[color-mix(in_srgb,var(--tier-second_apron)_5%,transparent)] px-3 py-2 text-[11.5px]">
          {issues.slice(0, 50).map((i, k) => (
            <li key={k}><span className="admin-mono">{i.path}</span> — {i.message}</li>
          ))}
        </ul>
      )}
      {result && <Status r={result} />}
      {diff != null && <DiffView text={diff} />}
      <textarea
        className="admin-textarea min-h-[60vh]"
        spellCheck={false}
        readOnly={readOnly}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}

import Link from "next/link";
import { DATA_FILES, validateAll } from "@/lib/admin/files";
import { dataStatus } from "@/lib/admin/git";

const OWNER: Record<string, { text: string; color: string }> = {
  curated: { text: "curated", color: "var(--tier-below_cap)" },
  sheet: { text: "sheet", color: "var(--tier-over_cap)" },
  scraped: { text: "scraped", color: "var(--muted)" },
};

/** Every data file the admin knows, its schema state, and whether it has uncommitted changes. */
export default async function AdminFiles() {
  const [validation, dirty] = await Promise.all([validateAll(), dataStatus().catch(() => [])]);
  const dirtySet = new Set(dirty.map((d) => d.path.split("/").pop()));
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[15px] font-bold tracking-tight">Data files</h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
          packages/data/src. Each file is validated against its schema (packages/data/src/schema.ts) on the way in and on the way out; a save that fails validation is refused.
        </p>
      </div>
      <div className="panel overflow-x-auto">
        <table className="admin-table min-w-[44rem]">
          <thead>
            <tr><th>File</th><th>Owner</th><th>Schema</th><th>Git</th><th>What it is</th></tr>
          </thead>
          <tbody>
            {DATA_FILES.map((f) => {
              const v = validation.find((x) => x.id === f.id)!;
              const o = OWNER[f.owner]!;
              return (
                <tr key={f.id}>
                  <td>
                    <Link href={`/admin/files/${f.id}`} className="font-semibold hover:text-[var(--accent-ink)]">{f.title}</Link>
                    <div className="admin-mono text-[10.5px] text-[var(--muted)]">{f.file}</div>
                  </td>
                  <td><span className="admin-tag" style={{ color: o.color, background: `color-mix(in srgb, ${o.color} 12%, transparent)` }}>{o.text}</span></td>
                  <td className="text-[11.5px]" style={{ color: v.issues.length ? "var(--tier-second_apron)" : "var(--tier-below_cap)" }}>
                    {v.issues.length ? `${v.issues.length} issue${v.issues.length === 1 ? "" : "s"}` : "valid"}
                  </td>
                  <td className="text-[11.5px]">{dirtySet.has(f.file) ? <span className="font-semibold text-[var(--accent-ink)]">modified</span> : <span className="text-[var(--muted)]">clean</span>}</td>
                  <td className="max-w-[28rem] text-[11.5px] text-[var(--muted)]">{f.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

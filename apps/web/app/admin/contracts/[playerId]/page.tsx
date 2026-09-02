import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_CONTRACTS, teamMeta, currentSalary } from "@/lib/league";
import { fmtFull } from "@/lib/format";
import { provenanceOf } from "@/lib/admin/provenance";
import { readJson } from "@/lib/admin/files";
import { ContractEditor } from "@/components/admin/ContractEditor";
import { TeamLogo } from "@/components/TeamLogo";

/**
 * One player's row. The top half is the reconciled contract the site shows,
 * with where each number came from; the bottom half edits the RAW row in the
 * file that holds it, which is the only edit that survives a rebuild.
 */
export default async function AdminContract({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: rawId } = await params;
  const playerId = decodeURIComponent(rawId);
  const c = BASE_CONTRACTS.find((x) => x.playerId === playerId);
  if (!c) notFound();
  const p = provenanceOf(c);
  let rawRow: Record<string, unknown> | null = null;
  if (p.source) {
    if (p.source.id === "contracts") rawRow = (await readJson<{ contracts: Record<string, unknown>[] }>("contracts-2025-26.json")).contracts[p.source.index] ?? null;
    else if (p.source.id === "extraContracts") rawRow = (await readJson<{ players: Record<string, unknown>[] }>("extra-contracts.json")).players[p.source.index] ?? null;
    else rawRow = (await readJson<Record<string, unknown>[]>("rookies-2026.json"))[p.source.index] ?? null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <TeamLogo id={c.teamId} size={36} />
        <div>
          <h2 className="text-xl font-bold tracking-tight">{c.playerName}</h2>
          <div className="text-[12px] text-[var(--muted)]">
            <Link href={`/admin/teams/${c.teamId}`} className="underline decoration-dotted underline-offset-2">{teamMeta(c.teamId).name}</Link>
            {" · "}
            <span className="tabular">{fmtFull(currentSalary(c))}</span> in 2026-27
            {c.deadMoney ? " · dead money" : ""}
            {" · id "}
            <span className="admin-mono">{c.playerId}</span>
          </div>
        </div>
      </div>

      <section className="panel p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[13.5px] font-bold">On the site today</h3>
          <span className="label">reconciled 2026-27 sheet</span>
        </div>
        <table className="admin-table">
          <thead>
            <tr><th>Season</th><th className="text-right">Cap hit</th><th>Guarantee</th></tr>
          </thead>
          <tbody>
            {c.years.map((y) => (
              <tr key={y.leagueYear}>
                <td className="tabular">{y.leagueYear}</td>
                <td className="tabular text-right">{fmtFull(y.salary)}</td>
                <td className="text-[11.5px] text-[var(--muted)]">{y.guarantee.replace("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--panel-2)]/50 p-3 text-[12px] leading-relaxed">
          <div className="label mb-1 !text-[10px]">Provenance</div>
          <div>
            Raw row:{" "}
            {p.source ? (
              <span>
                <span className="admin-mono">{p.source.file}</span> at index {p.source.index}
              </span>
            ) : (
              <span>none (synthesized)</span>
            )}
            {" · "}2026-27 cap hit governed by <strong>{p.currentYearGoverned}</strong>
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--text)]/85">
            {p.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      </section>

      {rawRow && p.source ? (
        <ContractEditor
          source={{ id: p.source.id as "contracts" | "extraContracts" | "rookies", index: p.source.index }}
          row={rawRow}
          reconciled={{ playerId: c.playerId, playerName: c.playerName, teamId: c.teamId, pos: "" }}
          governed={p.currentYearGoverned}
        />
      ) : (
        <section className="panel p-4 text-[12.5px] text-[var(--muted)]">
          This line has no raw row to edit: it is built by the pipeline from a feed row (a stated dead-cap charge, or a returning-veteran stub). Change the feed row in the{" "}
          <Link href="/admin/ledger" className="underline decoration-dotted underline-offset-2">ledger</Link> instead.
        </section>
      )}
    </div>
  );
}

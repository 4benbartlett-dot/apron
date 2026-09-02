import Link from "next/link";
import { notFound } from "next/navigation";
import { DATA_SCHEMAS, type SchemaId } from "@apron/data";
import { fileMeta, readRaw } from "@/lib/admin/files";
import { JsonEditor } from "@/components/admin/JsonEditor";

/** A raw file, with its schema checked live and a diff against HEAD on request. */
export default async function AdminFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(id in DATA_SCHEMAS)) notFound();
  const meta = fileMeta(id as SchemaId);
  const raw = await readRaw(meta.file);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">
            {meta.title} <span className="admin-mono text-[12px] font-normal text-[var(--muted)]">{meta.file}</span>
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{meta.description}</p>
        </div>
        <Link href="/admin/files" className="text-[12px] text-[var(--muted)] underline decoration-dotted underline-offset-2">all files</Link>
      </div>
      {meta.owner === "scraped" ? (
        <div className="rounded-md border border-[var(--tier-taxpayer)]/50 bg-[color-mix(in_srgb,var(--tier-taxpayer)_6%,transparent)] p-3 text-[12px]">
          This file is owned by its scraper and shown read-only: a hand edit lasts until the next pull. Refresh with <span className="admin-mono">{meta.refresh}</span>; correct a wrong row from the <Link href="/admin/ledger" className="underline">ledger</Link>.
        </div>
      ) : null}
      <JsonEditor id={meta.id} file={meta.file} text={raw.text} mtime={raw.mtime} bytes={raw.bytes} readOnly={meta.owner === "scraped"} />
    </div>
  );
}

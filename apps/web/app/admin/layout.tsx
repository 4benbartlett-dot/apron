import type { Metadata } from "next";
import Link from "next/link";
import { DATA_AS_OF } from "@apron/data";
import { requireAdmin } from "@/lib/admin/gate";
import { dataStatus, lastCommit, currentBranch } from "@/lib/admin/git";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Front office · Over the Apron",
  robots: { index: false, follow: false },
};

/**
 * The internal front office. Everything under /admin edits the flat files in
 * packages/data/src — the same files every public page is built from — and
 * hands the result to git. It is gated: on by default in development, off in
 * production unless APRON_ADMIN=1 (see lib/admin/gate.ts).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  requireAdmin();
  const [dirty, commit, branch] = await Promise.all([
    dataStatus().catch(() => []),
    lastCommit().catch(() => null),
    currentBranch().catch(() => ""),
  ]);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="admin-tag" style={{ background: "var(--accent-ink)", color: "var(--bg)" }}>
            Internal
          </span>
          <Link href="/admin" className="text-[17px] font-bold tracking-tight">
            Front office
          </Link>
        </div>
        <AdminNav />
        <div className="tabular ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
          <span>rosters as of {DATA_AS_OF}</span>
          {commit && (
            <span title={commit.subject}>
              {branch} @ {commit.hash}
            </span>
          )}
          <Link
            href="/admin/review"
            className={dirty.length ? "font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2" : ""}
          >
            {dirty.length ? `${dirty.length} data file${dirty.length === 1 ? "" : "s"} uncommitted` : "data tree clean"}
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}

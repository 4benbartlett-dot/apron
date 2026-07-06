import type { Metadata } from "next";
import Link from "next/link";
import { TEAM_IDS, teamNickname, byNickname } from "@/lib/league";
import { teamSlug, teamSeo, SITE } from "@/lib/seo";
import { fmtM } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";

export const metadata: Metadata = {
  title: "NBA Team Trade Machines — All 30 Cap Sheets | Over the Apron",
  description:
    "Every team's 2026-27 cap sheet, hard-cap status, and remaining exceptions — each with a CBA-exact trade machine that starts from the real July moves.",
  alternates: { canonical: `${SITE}/teams` },
};

export default function TeamsIndex() {
  const ids = [...TEAM_IDS].sort(byNickname);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight">Team trade machines</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        Thirty cap sheets, live from the real 2026 offseason — hard caps, spent exceptions, and all.
        Pick a team to see what it can still do, then build the trade.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ids.map((id) => {
          const t = teamSeo(id);
          return (
            <Link
              key={id}
              href={`/teams/${teamSlug(id)}/trade-machine`}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 hover:border-[var(--text)]"
            >
              <TeamLogo id={id} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold">{teamNickname(id)}</span>
                <span className="tabular block text-[11.5px] text-[var(--muted)]">
                  {fmtM(t.committed)}
                  {Number.isFinite(t.hardCap) ? ` · hard-capped (${t.hardCapSource?.split(" ").slice(-1)[0] ?? "July"})` : ""}
                  {t.roomTeam ? " · room team" : ""}
                </span>
              </span>
              <span className="text-[var(--muted)]">→</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE}/standings` },
  title: "Projected NBA Standings 2026-27 — East & West, Impact-Based Wins | Over the Apron",
  description:
    "Projected 2026-27 records for all 30 teams, ranked by conference from each roster's minutes-weighted impact — and how your trades and signings on the board change them, live.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE}/standings` },
  title: "NBA 2026-27 Playoff Odds & Projected Standings — Season Simulator | Over the Apron",
  description:
    "Every team's 2026-27 record so far, projected finish and playoff, play-in and title odds, from the rest of the season simulated 5,000 times. Stage a trade or signing and the odds rerun with it.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

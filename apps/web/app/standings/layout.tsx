import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projected NBA Standings 2026-27 — Impact-Based Wins | Over the Apron",
  description:
    "Every team's projected 2026-27 record from its roster's minutes-weighted impact — and how your trades and signings on the board change it, live.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

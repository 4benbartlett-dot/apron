import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NBA Cap Sheets, All 30 Teams — 2026-27 | Over the Apron",
  description:
    "League-wide 2026-27 salary standings: committed salary, tax and apron position, and hard caps for all 30 teams.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

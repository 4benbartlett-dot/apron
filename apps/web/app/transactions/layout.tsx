import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "2026 NBA Offseason Transactions | Over the Apron",
  description:
    "Current 2026 NBA offseason transactions — trades, signings, sign-and-trades — as the engine models them.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

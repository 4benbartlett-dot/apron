import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE}/transactions` },
  title: "2026-27 NBA Transactions | Over the Apron",
  description:
    "Every 2026-27 NBA transaction — trades, signings, waivers, extensions — as the engine models them.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

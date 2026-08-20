import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

// The one indexed route that had no title or description of its own, so Google
// was left to invent a snippet from whatever text matched the query — which on
// a brand search meant the footer.
export const metadata: Metadata = {
  title: "NBA Option, Guarantee & Extension Deadlines 2026-27 | Over the Apron",
  description:
    "Every upcoming player and team option, guarantee date, and qualifying-offer decision for 2026-27, plus who is extension-eligible — compiled from public reporting with the dollar figures attached.",
  alternates: { canonical: `${SITE}/deadlines` },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

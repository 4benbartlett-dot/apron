import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE}/draft` },
  title: "NBA Draft Pick Ownership — Team Pick Ledgers | Over the Apron",
  description:
    "Future NBA first- and second-round pick obligations, protections, and swaps from the current pick ledger.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

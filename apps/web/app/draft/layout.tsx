import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NBA Draft Pick Ownership — Team Pick Ledgers | Over the Apron",
  description:
    "Future NBA first- and second-round pick obligations, protections, and swaps from the current pick ledger.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

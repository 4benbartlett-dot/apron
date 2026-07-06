import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NBA Draft Pick Ownership — All 30 Teams | Over the Apron",
  description:
    "Who really owns every future NBA first- and second-round pick, with protections and swaps parsed from the real obligation ledger.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

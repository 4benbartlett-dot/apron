import type { Metadata } from "next";
import { GlossaryExplorer } from "@/components/GlossaryExplorer";

export const metadata: Metadata = {
  title: "CBA Glossary — Over the Apron",
  description:
    "Every apron-era CBA term in plain English: aprons, Bird rights, the MLEs, salary matching, hard caps, cap holds, and more — with citations.",
};

export default function GlossaryPage() {
  return <GlossaryExplorer />;
}

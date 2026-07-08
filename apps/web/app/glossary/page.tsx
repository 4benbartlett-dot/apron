import type { Metadata } from "next";
import { GlossaryExplorer } from "@/components/GlossaryExplorer";

export const metadata: Metadata = {
  title: "CBA Glossary — Over the Apron",
  description:
    "Plain-English CBA terms for the apron era: aprons, Bird rights, the MLEs, salary matching, hard caps, cap holds, and more.",
};

export default function GlossaryPage() {
  return <GlossaryExplorer />;
}

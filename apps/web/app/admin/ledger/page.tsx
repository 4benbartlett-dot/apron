import { TRANSACTIONS } from "@apron/data";
import { readJson } from "@/lib/admin/files";
import { LedgerEditor } from "@/components/admin/LedgerEditor";
import type { Transaction } from "@apron/data";

interface Correction { date: string; player: string; type: string; detail: string; why: string }

/** The curated moves and feed corrections, row by row, beside the scraped feed. */
export default async function AdminLedger() {
  const [moves, corrections, feed] = await Promise.all([
    readJson<{ note?: string; transactions: Transaction[] }>("manual-moves.json"),
    readJson<{ note?: string; corrections: Correction[] }>("feed-corrections.json"),
    readJson<{ transactions: Transaction[] }>("transactions.json"),
  ]);
  return (
    <LedgerEditor
      moves={moves.transactions}
      moveNote={moves.note ?? ""}
      corrections={corrections.corrections}
      feed={feed.transactions}
      merged={TRANSACTIONS.length}
    />
  );
}

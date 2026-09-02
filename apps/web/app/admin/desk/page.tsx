import { DATA_AS_OF } from "@apron/data";
import { Desk } from "@/components/admin/Desk";

/** The transaction desk: rule on a move with the engine, then file it. */
export default async function AdminDesk({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <Desk initial={{ tab: sp.tab, team: sp.team, player: sp.player }} asOf={DATA_AS_OF} />;
}

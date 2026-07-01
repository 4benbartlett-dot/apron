import type { LeagueConstants } from "../types";
import { SEASON_2025_26 } from "./2025-26";
import { SEASON_2026_27 } from "./2026-27";

export { SEASON_2025_26 } from "./2025-26";
export { SEASON_2026_27, SEASON_2026_27_PROJECTED } from "./2026-27";
export { deriveFromCap } from "./derive";

export const LEAGUE_CONSTANTS: Record<string, LeagueConstants> = {
  "2025-26": SEASON_2025_26,
  "2026-27": SEASON_2026_27,
};

/** The current default league year for the app. */
export const DEFAULT_LEAGUE_YEAR = "2025-26";

export function getConstants(leagueYear: string): LeagueConstants {
  const c = LEAGUE_CONSTANTS[leagueYear];
  if (!c) {
    throw new Error(
      `No CBA constants registered for league year "${leagueYear}". Known: ${Object.keys(
        LEAGUE_CONSTANTS,
      ).join(", ")}`,
    );
  }
  return c;
}

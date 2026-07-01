/**
 * Helpers to recompute the parts of a league year that are CLEAN functions of
 * the salary cap. Use these the moment the NBA posts the official cap memo
 * (around the start of the July moratorium) to replace projected values.
 *
 * IMPORTANT: the first and second aprons are NOT clean multiples of the cap —
 * they are separately specified dollar figures in the cap memo. So they must be
 * supplied from the official release; they cannot be derived here.
 */
export interface CapDerivable {
  minTeamSalary: number;
  luxuryTaxLine: number;
  maxSalary: { "0-6": number; "7-9": number; "10+": number };
}

/** Derive the cap-linked figures that ARE clean percentages of the cap. */
export function deriveFromCap(cap: number): CapDerivable {
  return {
    minTeamSalary: Math.round(cap * 0.9), // floor = 90% of cap
    luxuryTaxLine: Math.round(cap * 1.215), // tax = 121.5% of cap
    maxSalary: {
      "0-6": Math.round(cap * 0.25),
      "7-9": Math.round(cap * 0.3),
      "10+": Math.round(cap * 0.35),
    },
  };
}

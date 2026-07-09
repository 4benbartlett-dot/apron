import type { ApronTier, BirdStatus, LeagueConstants } from "./types";
import { classifyTier } from "./derive";
import { maxSalaryTier, reSignMax } from "./maxsalary";

export interface SigningOpts {
  isOwnFreeAgent?: boolean;
  /** Years of service — sets the 25/30/35% max tier. */
  yearsOfService?: number;
  /** Prior-year salary — for the Bird/Early-Bird/Non-Bird re-signing ceilings. */
  priorSalary?: number;
  /** Own-FA re-signing rights sub-type. */
  birdStatus?: BirdStatus;
  /** Apron Team Salary basis — signed salary EXCLUDING free-agent cap holds
   * (Art. VII §2: Free Agent Amounts don't count toward apron status). Gates
   * mechanism tiers and hard-cap ceilings. Cap-room math keeps using
   * `teamSalary`, where holds DO consume room. Defaults to `teamSalary`
   * (holds-included), which is the CONSERVATIVE legacy behavior. */
  apronSalary?: number;
  /** The team operated under the cap this league year (used room). Per
   * §6(n)(1) the NT-MLE/TP-MLE/BAE are gone for the year; the Room MLE is
   * the team's mid-level and persists even after it climbs back over the
   * cap (§6(g)). */
  roomTeam?: boolean;
  /** Dollars of each exception already spent this league year (real-world
   * feed + earlier session moves). Reduces what's left; §6(g)(3): any Room
   * MLE use also kills the other MLEs/BAE for the year. */
  consumed?: Partial<Record<MechanismId, number>>;
}

export type MechanismId =
  | "bird"
  | "cap_room"
  | "ntmle"
  | "tpmle"
  | "room_mle"
  | "bae"
  | "minimum";

export interface SignMechanism {
  id: MechanismId;
  label: string;
  /** Max first-year salary this mechanism can pay. */
  maxSalary: number;
  /** Apron line this mechanism hard-caps the team at, if any. */
  hardCap: "first_apron" | "second_apron" | null;
  /** Longest contract (in seasons) this mechanism can sign, per Art. VII.
   * Populated by spendingPower for every returned mechanism. */
  maxSeasons?: number;
  citation: string;
}

/** Max contract length by mechanism (2023 CBA Art. VII): Bird 5; cap space and
 * the Non-Tax MLE 4; the Room MLE 3; the Taxpayer MLE (§6(f)(1) — the 2023
 * CBA cut it from 3 seasons to 2), the Bi-Annual Exception, and the minimum 2. */
export const MECHANISM_MAX_SEASONS: Record<MechanismId, number> = {
  bird: 5,
  cap_room: 4,
  ntmle: 4,
  tpmle: 2,
  room_mle: 3,
  bae: 2,
  minimum: 2,
};

export interface SpendingPower {
  teamSalary: number;
  tier: ApronTier;
  capRoom: number;
  mechanisms: SignMechanism[];
}

const CITES: Record<MechanismId, string> = {
  bird: "Bird rights — re-sign your own free agent over the cap, up to the max.",
  cap_room: "Team is under the cap; signs into cap space.",
  room_mle: "Room MLE — for teams that operated under the cap.",
  ntmle:
    "Non-Taxpayer MLE — teams under the first apron; using it hard-caps at the first apron.",
  tpmle:
    "Taxpayer MLE — teams over the first apron; using it hard-caps at the second apron.",
  bae: "Bi-Annual Exception — teams under the first apron; hard-caps at the first apron.",
  minimum: "Minimum-salary exception — available to any team.",
};

/**
 * What a team can offer in free agency given its current salary. Mechanisms are
 * gated by the team's apron tier, exactly as the 2023 CBA prescribes.
 */
export function spendingPower(
  teamSalary: number,
  c: LeagueConstants,
  opts: SigningOpts = {},
): SpendingPower {
  // Tier (exception gating) tests Apron Team Salary — holds excluded.
  // Cap room tests full team salary — holds included.
  const tier = classifyTier(opts.apronSalary ?? teamSalary, c);
  const capRoom = c.salaryCap - teamSalary;
  const spent = (id: MechanismId) => opts.consumed?.[id] ?? 0;
  // §6(g)(3): any Room MLE use kills the other MLEs/BAE for the year, even
  // if the roomTeam flag wasn't passed explicitly.
  const roomTeam = (opts.roomTeam ?? false) || spent("room_mle") > 0;
  const mechanisms: SignMechanism[] = [];
  const push = (m: SignMechanism) => {
    const remaining = m.maxSalary - spent(m.id);
    if (remaining >= 1_000) mechanisms.push({ ...m, maxSalary: remaining });
  };

  if (opts.isOwnFreeAgent) {
    mechanisms.push({
      id: "bird",
      label: "Bird rights",
      maxSalary: c.maxSalary["10+"], // simplification: full max
      hardCap: null,
      citation: CITES.bird,
    });
  }

  if (capRoom > 0) {
    mechanisms.push({
      id: "cap_room",
      label: "Cap space",
      maxSalary: capRoom,
      hardCap: null,
      citation: CITES.cap_room,
    });
  }
  if (roomTeam || capRoom > 0) {
    // The room team's mid-level. Once earned it persists for the year even
    // after the team climbs back over the cap (§6(g)).
    push({
      id: "room_mle",
      label: "Room MLE",
      maxSalary: c.roomMLE,
      hardCap: null,
      citation: CITES.room_mle,
    });
  }
  if (!roomTeam && capRoom <= 0) {
    // capRoom <= 0 means the team is over the cap once holds are counted. A
    // below_cap APRON tier here is a team whose SIGNED salary is under the cap
    // but whose FA holds push it over — still an over-the-cap non-taxpayer, so
    // it keeps the full Non-Taxpayer MLE + BAE (not just the minimum).
    if (tier === "below_cap" || tier === "over_cap" || tier === "taxpayer") {
      // Over the cap but under the first apron.
      push({
        id: "ntmle",
        label: "Non-Tax MLE",
        maxSalary: c.nonTaxpayerMLE,
        hardCap: "first_apron",
        citation: CITES.ntmle,
      });
      push({
        id: "bae",
        label: "Bi-Annual",
        maxSalary: c.biAnnualException,
        hardCap: "first_apron",
        citation: CITES.bae,
      });
    } else if (tier === "first_apron") {
      push({
        id: "tpmle",
        label: "Taxpayer MLE",
        maxSalary: c.taxpayerMLE,
        hardCap: "second_apron",
        citation: CITES.tpmle,
      });
    }
  }
  // tier === "second_apron": no MLE/BAE — minimum only (plus Bird for own FAs).

  // The minimum is PLAYER-specific: an 8-YOS free agent's minimum contract
  // pays the 8-YOS figure, not the 10+ one. Without a player in context
  // (team-board view) the 10+ ceiling is the tool's generic maximum.
  const minYos = Math.min(Math.max(Math.floor(opts.yearsOfService ?? 10), 0), 10);
  mechanisms.push({
    id: "minimum",
    label: "Minimum",
    maxSalary: c.minimumSalaries[minYos] ?? c.minimumSalaries[10] ?? 0,
    hardCap: null,
    citation: CITES.minimum,
  });

  for (const m of mechanisms) m.maxSeasons = MECHANISM_MAX_SEASONS[m.id];
  return { teamSalary, tier, capRoom, mechanisms };
}

// When several mechanisms can cover a salary, use the least costly one. The
// minimum is free — no hard cap, no exception burned — so it MUST rank ahead of
// the exceptions: an over-cap team signing a player at his minimum should use
// the Minimum exception, NOT waste its Non-Tax MLE (and trigger a first-apron
// hard cap) on a deal the minimum already covers. bird/cap_room stay first as
// the natural tools for own re-signs and under-cap teams.
const PRIORITY: MechanismId[] = [
  "bird",
  "cap_room",
  "minimum",
  "ntmle",
  "tpmle",
  "room_mle",
  "bae",
];

function apronLine(
  hc: SignMechanism["hardCap"],
  c: LeagueConstants,
): number {
  if (hc === "first_apron") return c.firstApron;
  if (hc === "second_apron") return c.secondApron;
  return Infinity;
}

export interface SigningVerdict {
  legal: boolean;
  /** Highest-priority mechanism that legally covers the asking salary. */
  mechanism: SignMechanism | null;
  /** Largest first-year salary the team could pay this player at all. */
  maxOffer: number;
  maxOfferMechanism: SignMechanism | null;
  resultingSalary: number;
  hardCap: "first_apron" | "second_apron" | null;
  reason: string;
}

const EPS = 1;
const fmt = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

/**
 * Can a team at `teamSalary` sign a free agent for `askingSalary`? Returns the
 * mechanism it would use, the most it could offer, and any hard cap triggered.
 */
export function validateSigning(
  teamSalary: number,
  askingSalary: number,
  c: LeagueConstants,
  opts: SigningOpts = {},
): SigningVerdict {
  const power = spendingPower(teamSalary, c, opts);
  // Hard-cap ceilings test Apron Team Salary (holds excluded, Art. VII §2).
  const apron = opts.apronSalary ?? teamSalary;

  // The player's individual salary ceiling (max-tier by years of service, and
  // for own free agents the Bird / Early-Bird / Non-Bird re-signing limit).
  // When YOS/prior are unknown, defaults fall back to the 35% tier max.
  const yos = opts.yearsOfService ?? 10;
  const prior = opts.priorSalary ?? Number.POSITIVE_INFINITY;
  const playerMax = opts.isOwnFreeAgent
    ? reSignMax(opts.birdStatus ?? "bird", prior, yos, c)
    : maxSalaryTier(yos, c);
  const overMax = askingSalary > playerMax + EPS;

  const usable = overMax
    ? []
    : power.mechanisms.filter(
        (m) =>
          askingSalary <= m.maxSalary + EPS &&
          apron + askingSalary <= apronLine(m.hardCap, c) + EPS,
      );
  const mechanism =
    [...usable].sort(
      (a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id),
    )[0] ?? null;

  // Largest single-mechanism offer, respecting each mechanism's hard cap AND
  // the player's own maximum.
  let maxOffer = 0;
  let maxOfferMechanism: SignMechanism | null = null;
  for (const m of power.mechanisms) {
    const room = apronLine(m.hardCap, c) - apron;
    const offer = Math.max(0, Math.min(m.maxSalary, room, playerMax));
    if (offer > maxOffer) {
      maxOffer = offer;
      maxOfferMechanism = m;
    }
  }

  const legal = mechanism !== null;
  return {
    legal,
    mechanism,
    maxOffer,
    maxOfferMechanism,
    resultingSalary: teamSalary + askingSalary,
    hardCap: mechanism?.hardCap ?? null,
    reason: legal
      ? `Signs for ${fmt(askingSalary)} via the ${mechanism!.label}` +
        (mechanism!.hardCap
          ? ` — hard-caps at the ${
              mechanism!.hardCap === "first_apron" ? "first" : "second"
            } apron.`
          : ".")
      : overMax
        ? `${fmt(askingSalary)} exceeds the player's maximum of ${fmt(playerMax)}${
            opts.isOwnFreeAgent && opts.birdStatus && opts.birdStatus !== "bird"
              ? ` (${opts.birdStatus === "early_bird" ? "Early Bird" : "Non-Bird"} limit)`
              : ""
          }.`
        : `Can't reach ${fmt(askingSalary)} — most this team can pay is ${fmt(
            maxOffer,
          )} via the ${maxOfferMechanism?.label ?? "minimum"}.`,
  };
}

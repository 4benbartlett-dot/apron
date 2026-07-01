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
  citation: string;
}

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
  opts: { isOwnFreeAgent?: boolean } = {},
): SpendingPower {
  const tier = classifyTier(teamSalary, c);
  const capRoom = c.salaryCap - teamSalary;
  const mechanisms: SignMechanism[] = [];

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
    mechanisms.push({
      id: "room_mle",
      label: "Room MLE",
      maxSalary: c.roomMLE,
      hardCap: null,
      citation: CITES.room_mle,
    });
  } else if (tier === "over_cap" || tier === "taxpayer") {
    // Over the cap but under the first apron.
    mechanisms.push({
      id: "ntmle",
      label: "Non-Tax MLE",
      maxSalary: c.nonTaxpayerMLE,
      hardCap: "first_apron",
      citation: CITES.ntmle,
    });
    mechanisms.push({
      id: "bae",
      label: "Bi-Annual",
      maxSalary: c.biAnnualException,
      hardCap: "first_apron",
      citation: CITES.bae,
    });
  } else if (tier === "first_apron") {
    mechanisms.push({
      id: "tpmle",
      label: "Taxpayer MLE",
      maxSalary: c.taxpayerMLE,
      hardCap: "second_apron",
      citation: CITES.tpmle,
    });
  }
  // tier === "second_apron": no MLE/BAE — minimum only (plus Bird for own FAs).

  mechanisms.push({
    id: "minimum",
    label: "Minimum",
    maxSalary: c.minimumSalaries[10] ?? 0,
    hardCap: null,
    citation: CITES.minimum,
  });

  return { teamSalary, tier, capRoom, mechanisms };
}

const PRIORITY: MechanismId[] = [
  "bird",
  "cap_room",
  "ntmle",
  "tpmle",
  "room_mle",
  "bae",
  "minimum",
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
          teamSalary + askingSalary <= apronLine(m.hardCap, c) + EPS,
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
    const room = apronLine(m.hardCap, c) - teamSalary;
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

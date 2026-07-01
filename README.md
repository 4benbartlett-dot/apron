# Apron

**An NBA trade & free-agency simulator that actually encodes the 2023 CBA.**

Build any trade, sign any free agent, and get an instant legal/illegal verdict —
with the rule that explains *why*. The wedge: every public tool (ESPN, Spotrac,
Fanspo, RealGM) is strong at salary-matching and weak-to-absent at the two things
front offices actually care about — **correct apron enforcement** and
**free-agency sequencing** (cap holds, order-of-operations, exception
consumption, the hard cap a move *triggers*). No public tool models a *sequence*
of offseason moves as a first-class object. That's the gap.

> Salary figures are facts (legal to publish, per *Feist* / *NBA v. Motorola*).
> This project is not affiliated with, endorsed by, or sponsored by the NBA or
> NBPA. No team logos or player likenesses are used.

## Status

Early build. The **CBA rules engine** (`packages/cba-engine`) is the moat and is
being built first, with golden tests, before any UI.

- ✅ League-year constants (2025-26 **official**; 2026-27 **projection**, flagged)
- ✅ Cap-sheet derivation + apron-tier classification
- ✅ Trade salary-matching (expanded bands below the apron; strict 100% at/above)
- ✅ Hard-cap-on-trigger (expanded matching can't vault you over the first apron)
- ✅ Second-apron prohibitions (no aggregation, no cash-out) with cited reasons
- ✅ **Real data** — 509 contracts across all 30 teams scraped from
  Basketball-Reference (`packages/data`, multi-year salaries)
- ✅ **Web app** (`apps/web`, Next.js) — League Cap Board (apron thermometers) +
  interactive Trade Machine with live legal/illegal verdicts and explanations
- ⏳ Free-agency signing sim (exceptions + Bird rights + cap-hold order-of-ops)
- ⏳ Dead-money/guarantee pass (subtract non-guaranteed/dead rows from team totals)
- ⏳ Multi-team (3-5) trades, draft-pick ledger, shareable trade cards
- ⏳ TPEs, trade kickers, base-year comp, poison-pill, sign-and-trade

## Architecture

A TypeScript monorepo. The heart is `packages/cba-engine`: a **pure, I/O-free**
rules engine that runs **identically in the browser** (instant simulation) **and
on the server** (canonical validation, so a shared link can't smuggle in an
illegal trade).

- A team's salary / apron tier / room are **never stored** — always *derived*
  from contracts via pure functions. Deterministic and replayable.
- League-year dollar thresholds live in **one versioned file per season**
  (`src/constants/`). The annual July update = swap constants + re-run golden tests.
- Every legality verdict carries a **plain-English reason + a CBA citation**, so
  the UI can always explain *why*.

## Quickstart

```bash
pnpm install
pnpm --filter @apron/cba-engine test       # 23 golden + unit tests
pnpm --filter @apron/cba-engine typecheck
pnpm --filter @apron/cba-engine demo        # prints a cited legal/illegal verdict
```

### Using the engine

```ts
import { validateTrade, SEASON_2025_26, capSheet } from "@apron/cba-engine";

const verdict = validateTrade(leagueData, trade, SEASON_2025_26);
if (!verdict.legal) {
  for (const v of verdict.violations) console.log(v.reason, "—", v.citation);
}
```

## Verified CBA reference (the engine's source of truth)

**2025-26 (official, exact):** cap `$154,647,000` · tax `$187,895,000` · first
apron `$195,945,000` · second apron `$207,824,000` · floor `$139,182,300`.
Non-Tax MLE `$14,104,000` · Taxpayer MLE `$5,685,000` · Room MLE `$8,781,000` ·
BAE `$5,134,000`. Max salary 25/30/35% = `$38.66M / $46.39M / $54.13M`.

**2026-27 (projection until the July cap memo):** cap ~`$165M` · tax ~`$201M` ·
first apron ~`$209M` · second apron ~`$222M`. ~7% growth (below the 10% smoothing
max) after a local-media revenue dip. **Do not treat as final** — the engine
derives the cap-linked figures (tax/floor/max) from the official cap when posted;
the aprons are separately specified and must come from the memo.

**Salary matching (current 2023 CBA):**
- Below the first apron: outgoing ≤ $7.5M → 200% + $250k; $7.5M–$29M → outgoing +
  $7.5M; > $29M → 125% + $250k.
- At/above either apron: strict **100%** (the 110% figure was a 2023-24
  transition-only rule and is dead — a common bug in competing machines).
- Second apron additionally: **no aggregation**, no cash out, no MLE, no S&T
  acquisition, frozen pick 7 years out.

## License / data posture

Code: TBD. Player names + salaries are facts and publishable. The real exposure
is trademark/likeness — avoid official logos and headshots; carry the NBA/NBPA
disclaimer. Contract data will come from **free/open sources only** (no paid
APIs); ToS-prohibited scrape-and-redistribute sources (Spotrac,
Basketball-Reference) are off the table for the public build.

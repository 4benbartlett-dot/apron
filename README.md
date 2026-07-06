# Over the Apron

**The NBA offseason, under the real CBA.** — live at
[overtheapron.com](https://overtheapron.com)

Over the Apron is a trade machine and free-agency simulator that actually enforces the
2023 collective bargaining agreement. Build any trade, sign any free agent,
extend, renounce, and run a full offseason — every move builds on the last from
live rosters, and every verdict tells you *which rule* made it legal or illegal.

Most trade machines check salary matching and stop. Over the Apron enforces the rules
that actually decide deals in the apron era:

- **Apron system** — first/second-apron tiers with strict "exceeds" boundaries,
  100% matching for apron teams, second-apron prohibitions (no aggregation via a
  true bin-packing test, no cash out, no sign-and-trade acquisitions), and
  **hard caps that persist**: use the Non-Taxpayer MLE and every later signing
  and trade is checked against the first apron for the rest of the year.
- **Trade matching** — the CBA's exact expanded formula (200% + $250k / outgoing +
  an escalated $7.5M — $9,095,709 in 2026-27 / 125% + $250k),
  below-cap room absorption, trade kickers, base-year compensation, and the full
  trade-freeze calendar (rookies 30 days, offseason signings Dec 15, over-cap
  Bird raises Jan 15, out-of-bounds extensions 6 months, matched RFAs one year).
- **Free agency** — Bird / Early-Bird / Non-Bird ceilings with each player's
  real rights status, cap holds by Bird type, renouncing (with Bird rights
  forfeited), MLE/BAE/room gating and consumption, max-salary tiers, restricted
  free agency with the Gilbert Arenas cap and a real offer-sheet **match flow**.
- **Sign-and-trade, both sides** — 3–4 season term, first-apron hard cap, the
  old team's salary-matching on the return package, and the acquirer's
  room-or-matching requirement.
- **Draft picks as real assets** — a pick-ownership ledger where executed trades
  transfer picks, valued sensibly in the fairness meter, with the Stepien rule
  checked against full inventory (including picks you traded three moves ago).
- **A trade finder** — pick a target and it searches the acquirer's roster for
  every package that survives the full rulebook, ranked by fit and value given.

## Accuracy

Two kinds of proof back every verdict:

1. **Text verification** — the engine's constants and formulas are asserted
   against the CBA's own definitions in unit tests (exception amounts as % of
   cap, max-salary tiers, matching bands), and each rule carries its
   Article/Section citation into the UI.
2. **Reality replay** — `apps/web/lib/realmoves.test.ts` reconstructs real 2026
   free-agency transactions (trades, sign-and-trades, signings) against their
   pre-move state and asserts the engine calls them legal. Real moves are legal
   by definition; a rejection is a bug. The suite runs on every push.

What's approximated or not yet modeled is documented in the app at
[`/accuracy`](apps/web/app/accuracy/page.tsx) — pick protections/swaps, TPEs as
expiring objects, designated-player criteria, and a few data-precision notes.

## Stack

pnpm + TypeScript monorepo:

```
packages/cba-engine   Pure, dependency-free rules engine (validateTrade,
                      validateSigning, sign-and-trade, extensions, provisions)
                      — 174 tests (93 engine, 81 web), every check returns a reason + citation
packages/data         League data: contracts, transactions, free-agent rights,
                      draft picks, player ratings, plus the refresh scripts
apps/web              Next.js app — the offseason board, drawers, trade finder,
                      league cap board, and shareable sessions
```

The engine is I/O-free and runs identically in the browser (instant simulation)
and on the server. Team salary, apron tier, and room are never stored — always
derived from contracts, so sessions are deterministic and replayable.
League-year dollar thresholds live in one versioned file per season; the annual
July update is a constants swap plus a green test run.

```ts
import { validateTrade, SEASON_2026_27 } from "@apron/cba-engine";

const verdict = validateTrade(leagueData, trade, SEASON_2026_27);
if (!verdict.legal) {
  for (const v of verdict.violations) console.log(v.reason, "—", v.citation);
}
```

## Develop

```bash
pnpm install
pnpm --filter @apron/web dev          # http://localhost:3000
pnpm -r test                          # engine + app suites
pnpm --filter @apron/web typecheck
```

Data refresh: the scripts in `packages/data/scripts/` rebuild the JSON
snapshots from public sources (set `FIRECRAWL_API_KEY` in your environment for
sources that need a rendering proxy), then commit the updated JSON.

## Deploy

See [DEPLOY.md](DEPLOY.md) — it's a standard Next.js app; on Vercel set the
project root to `apps/web`.

## Status & data posture

Active personal project, built during the 2026 offseason. Player names and
salary figures are facts compiled from publicly available sources. Not
affiliated with, endorsed by, or sponsored by the NBA or the NBPA.

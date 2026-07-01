# Apron — Handoff (for the next agent)

You're continuing work on **Apron**, an NBA 2023-CBA offseason simulator. This
doc is a cold-start briefing: the task, the current state, the gotchas, and
exactly where to pick up.

---

## The task the user just gave (do these in order)

A wave of **July 1, 2026** moves dropped overnight (see below). The user wants:

1. **FIRST, validate — don't update yet.** Test each real move that happened
   since we last worked *against our engine*. Real NBA moves are CBA-legal, so
   **any move our sim rejects = a bug in our sim.** Run every trade + signing
   through `validateTrade` / `validateSigning` and confirm legal. Investigate &
   fix anything that fails.
2. **Check they match our priors** — player value, pick value, rules/dynamics
   (e.g. a star-for-star swap shouldn't read as a lopsided fleece; picks should
   be valued sensibly; apron/matching rules should hold).
3. **Then update the data** to reflect all the new moves.
4. **Build all three deferred features + anything else you discover:**
   - **Pick-ownership ledger** (highest leverage): picks should actually
     *transfer* in trades, Stepien should see picks traded in prior moves, and
     protected picks / swaps should be represented. Today picks are generated
     fresh per team each render and never move.
   - **RFA offer-sheet match flow**: the original team's accept/decline decision.
     (Today we label RFAs + enforce the Arenas first-year cap, but the match
     isn't simulated.)
   - **Roster/limit rules**: 15 standard + 2 two-way roster limits, sign-and-trade
     3-year minimum length, extended-player 6-month trade freeze, designated-player
     limits (max 2, "no two acquired via trade"), Rose Rule / designated-rookie
     30% eligibility.

### The July 1 moves to validate (from the user's screenshot, RealGM feed)
- **Paul George (PHI) ⇄ Jaylen Brown (BOS)** + picks (2028 1st [BOS swap], 2031
  1st [unprotected PHI], 2028 2nd, 2030 2nd to BOS) — the blockbuster. Both are
  apron teams; **make sure our engine calls it LEGAL** (salary match, apron 100%
  matching, no false hard-cap/aggregation block).
- **AJ Johnson (DAL) ⇄ Santi Aldama (MEM)** + 2030 1st [protected GSW pick] + two 2nds.
- Rookie-scale signings: **Koa Peat** (PHX 4yr $15.03M), **Yaxel Lendeborg**
  (GSW 4yr $28.1M).
- **Henri Veesaar** (ATL 4yr $9.26M via 2nd-round exception, '29-30 team option),
  **Bogoljub Marković** (MIL 4yr $9.26M, '29-30 team option), **Ryan Conwell**
  (MIA), **Adam Flagler** (SAC two-way), **Leaky Black** waived by WAS.

### ⚠️ BLOCKER I hit right before handoff
Re-scraping **Spotrac's transactions feed still tops out at Jun 30** (305 txns)
— the July 1 trades (PG⇄Brown, AJ Johnson⇄Aldama) are NOT on it yet. The user's
screenshot is from **RealGM** (`Results: 355`, date range 6/1–7/1). So to get the
July 1 moves you likely need to **scrape RealGM's transactions page** (or another
source), not just re-run `scrape-transactions.mjs`. Note: the *signed-FA* scrape
DID grow to 56 (was 17), so `signings.json` has newer signings; only the big
**trades** are missing. Firecrawl key is in `~/.env` (never echo it).

---

## Project facts

- **Location:** `~/Desktop/apron`. pnpm TS monorepo:
  `packages/cba-engine` (pure rules engine, 81 vitest tests),
  `packages/data` (scraped JSON + scrapers),
  `apps/web` (Next 15 app, 9 vitest tests).
- **Deployed:** live on **Vercel**, auto-redeploys on push to `main` of the
  **private** repo `github.com/4benbartlett-dot/apron` (gh authed as
  `4benbartlett-dot`). Root Directory on Vercel = `apps/web`.
- **Preview dev server:** use the `preview_start` tool, name `"web"`, port 3100.
  Reload with `preview_eval` (`location.reload()`); drive/verify with the
  `preview_*` tools (screenshots glitch sometimes — prefer `preview_eval` DOM checks).
- **Data:** scraped via Firecrawl (Spotrac + RealGM + Basketball-Reference).
  Scrapers in `packages/data/scripts/`: `scrape-transactions`, `scrape-signings`
  (Spotrac signed-FA page → structured team/term/AAV), `scrape-free-agents`
  (Bird status + UFA/RFA), `scrape-ratings` (B-Ref BPM → OVR), `scrape-bref`
  (contracts, multi-year), `scrape-experience`, `scrape-spotrac-extras`
  (deadlines + extension-eligible), `scrape-draft-picks`, `scrape-draft`.

## Gotchas (learned the hard way)
- **NEVER run `pnpm --filter @apron/web build` while the dev server is running** —
  it corrupts the shared `.next` and 500s every page. Use `typecheck` to verify.
  If a real build is needed: stop preview → `rm -rf apps/web/.next` → build →
  `rm -rf .next` → restart preview.
- Engine + data resolve to **`src` directly** (no build step) — HMR picks up
  changes to `league.ts`/engine automatically.
- Two name normalizers in `league.ts`: **`normName`** (~line 16, matches the
  scrapers — used to join `FREE_AGENT_INFO`/`SIGNINGS`) and **`norm`** (~line 67,
  strips to `[a-z]` only — used in trade/sign reconciliation). Don't mix them.
- Never echo the Firecrawl key. Keep this project separate from MLFC/work.

## How to verify
- `pnpm --filter @apron/cba-engine test` (81 pass) ·
  `pnpm --filter @apron/web test` (9 pass) ·
  `pnpm --filter @apron/web typecheck`.
- App-layer tests live in `apps/web/lib/*.test.ts` (vitest is wired in
  `apps/web/vitest.config.ts` with the `@` alias). **For the move-validation
  task, write `apps/web/lib/realmoves.test.ts`** that imports `BASE_CONTRACTS`
  + the engine and runs each real trade/signing through `validateTrade`/
  `validateSigning`, asserting legal. For the PG⇄Brown trade build
  `{ teams:["BOS","PHI"], players:[{playerId:PG,from:"PHI",to:"BOS"},
  {playerId:Brown,from:"BOS",to:"PHI"}] }` — picks don't affect salary matching.

---

## What was just done this session (so you know the current state)

Recent commits fixed a big batch of data + CBA holes (all pushed to `main`):
- **Options:** `applyOptions` in `league.ts` — 37 players who declined their
  2026-27 option now become FAs (Harden, Draymond, Melton, …). Reconciliation
  order: `dedupe → applyOptions → applyTrades → applySignings → applySignedFA → +rookies`.
- **Trade eligibility:** offseason signings carry `FA_RESTRICTION` → NO-TRADE
  until Dec 15 (set in `applySignings` + `applySignedFA`).
- **RFA status** derived from qualifying-offer transactions (`faTypeOf`/`QO_STATUS`).
- **Hard-cap persistence** (was the audit's #1 critical): `store.ts` `hardCapOf(team)`
  computes the tightest apron a team hard-capped itself at (NT-MLE/BAE/S&T→1st,
  Tax-MLE→2nd); enforced in `SignEditor` (`legalSign`) and the trade verdict
  (`hardCapTradeViolations`).
- **Value model:** `tradeValue` floors at rotation-average (rating 62) so
  salary-filler throw-ins ≈ 0; new `pickValue(year, round)`; picks included in the
  `valueByTeam` fairness meter.
- **Extensions:** `isExtensionEligible` is now **date-gated** (`SIM_TODAY =
  2026-07-01`; AD's window opens 8/4 so he's correctly not eligible). ExtendDrawer
  caps total contract at **5 years**, computes 140% off the **final** year, only
  full-Bird gets 5-year signings, Non-Bird gets 5% raises.
- **Multi-year reconciliation:** `dealFromAav(aav, term)` back-solves year-1 from
  the AAV + 5% raises, so signed FAs are real multi-year deals (no more vanishing
  after 2026-27).

## The poke-holes audit (reference)
Full output: `/private/tmp/claude-501/-Users-schoolbenbartlett-Desktop/f6f9d2d7-c539-41c5-a1e8-0a7cd1f5feb1/tasks/wdf9p958t.output`
— 28 confirmed holes. Critical + several high fixed (above). **Still open** (=
the deferred features to build in step 4): pick-ownership ledger, RFA match flow,
roster-size limits, S&T 3-year min, extended-player 6-month freeze,
designated-player limits, Rose Rule.

## Key files
- `apps/web/lib/league.ts` — reconciliation pipeline, `Move` union, `applyMove`,
  helpers (`normName`, `norm`, `isExtensionEligible`, `faTypeOf`, `tradeValue`,
  `pickValue`, `ratingOf`, `dealFromAav`, `signingYears`, `applyOptions`,
  `applyTrades`, `applySignings`, `applySignedFA`).
- `apps/web/lib/store.ts` — `useLeague` (`hardCapOf`, `teamHolds`, `multiYear`, …),
  `dispatchMove`, `toggleRenounce`, `removeMoveAt`.
- `apps/web/components/OffseasonSim.tsx` — the whole sim UI: board, `TeamColumn`
  (roster/holds/renounce/EXT/multi-year cap sheet), `SignEditor` (mechanisms,
  Bird, Arenas/RFA, S&T return package, hard-cap check), `ExtendDrawer`,
  `TradeVerdict` (+ `stepienViolations`, `hardCapTradeViolations`, fairness
  meter), `TradeFinderDrawer`.
- `packages/cba-engine/src/` — `validateTrade`, `matching`, `signing`,
  `maxsalary`, `extensions`, `provisions` (Stepien/Arenas/poison-pill/offer-sheet),
  `signandtrade`, `holds`, `derive`, `constants/`.
- Data JSON: `packages/data/src/{contracts-2025-26,transactions,signings,
  free-agents,ratings,extension-eligible,draft-picks,rookies-2026,experience}.json`.

## Suggested first three moves
1. Get the July 1 data (scrape RealGM transactions or find the source with the
   PG⇄Brown trade); merge into `transactions.json` / `signings.json`.
2. Write `apps/web/lib/realmoves.test.ts` and run every real trade/signing
   through the engine; triage failures (they're bugs).
3. Build the **pick-ownership ledger** — it's the highest-leverage remaining
   item and the user asked for it explicitly.
